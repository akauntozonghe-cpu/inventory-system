import {summarizeStock} from "@/lib/stock-state";
import { renameClassificationMaster } from "@/lib/classification-links";
import { ensureClassification } from "@/lib/item-links";
import { normalizeDisplayText } from "@/lib/input-normalization";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAdminActionLog } from "@/lib/error-report";

function text(value: unknown, max = 100) { return normalizeDisplayText(value, max); }

async function mergeInventory(sourceLocationId: string, targetLocationId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const [from, to] = await Promise.all([tx.storageLocation.findUnique({ where: { id: sourceLocationId } }), tx.storageLocation.findUnique({ where: { id: targetLocationId } })]);
    if (!from || !to) throw new Error("LOCATION_CHANGED");
    const source = await tx.inventoryInstance.findMany({ where: { storageLocationId: sourceLocationId }, orderBy: { createdAt: "asc" } });
    let moved = 0, consolidated = 0;
    for (const inventory of source) {
      const duplicate = await tx.inventoryInstance.findFirst({ where: { id: { not: inventory.id }, storageLocationId: targetLocationId, itemId: inventory.itemId, lotNo: inventory.lotNo, expirationDate: inventory.expirationDate } });
      if (!duplicate) {
        await tx.inventoryInstance.update({ where: { id: inventory.id }, data: { storageLocationId: targetLocationId } });
        moved += 1;
        continue;
      }
      const sourceTargets = await tx.stocktakeTarget.findMany({ where: { inventoryInstanceId: inventory.id } });
      for (const row of sourceTargets) {
        await tx.stocktakeTarget.upsert({ where: { sessionId_inventoryInstanceId: { sessionId: row.sessionId, inventoryInstanceId: duplicate.id } }, update: { expectedQuantity: { increment: row.expectedQuantity } }, create: { sessionId: row.sessionId, inventoryInstanceId: duplicate.id, expectedQuantity: row.expectedQuantity } });
      }
      const sourceRecords = await tx.stocktakeRecord.findMany({ where: { inventoryInstanceId: inventory.id } });
      for (const row of sourceRecords) {
        await tx.stocktakeRecord.upsert({ where: { sessionId_inventoryInstanceId: { sessionId: row.sessionId, inventoryInstanceId: duplicate.id } }, update: { countedQuantity: { increment: row.countedQuantity }, memo: "保管場所統合により棚卸記録を合算" }, create: { sessionId: row.sessionId, inventoryInstanceId: duplicate.id, countedQuantity: row.countedQuantity, memo: row.memo } });
      }
      await tx.stocktakeRecord.deleteMany({ where: { inventoryInstanceId: inventory.id } });
      await tx.stocktakeTarget.deleteMany({ where: { inventoryInstanceId: inventory.id } });
      await tx.inventoryHistory.updateMany({ where: { inventoryInstanceId: inventory.id }, data: { inventoryInstanceId: duplicate.id } });
      await tx.inventoryEvent.updateMany({ where: { inventoryInstanceId: inventory.id }, data: { inventoryInstanceId: duplicate.id } });
      await tx.marketplaceListing.updateMany({ where: { inventoryInstanceId: inventory.id }, data: { inventoryInstanceId: duplicate.id } });
      await tx.inventoryInstance.update({ where: { id: duplicate.id }, data: { quantity: { increment: inventory.quantity }, actualQuantity: duplicate.actualQuantity === null || inventory.actualQuantity === null ? null : duplicate.actualQuantity + inventory.actualQuantity } });
      await tx.inventoryEvent.create({ data: { inventoryInstanceId: duplicate.id, eventType: "TRANSFER_IN", quantityBefore: duplicate.quantity, quantityChange: inventory.quantity, quantityAfter: duplicate.quantity + inventory.quantity, reason: "保管場所統合", performedByUserId: actorId, detail: { mergedInventoryInstanceId: inventory.id, sourceLocationId, targetLocationId } } });
      await tx.inventoryInstance.delete({ where: { id: inventory.id } });
      consolidated += 1;
    }
    await tx.itemRegistrationRequest.updateMany({ where: { storageLocationId: sourceLocationId }, data: { storageLocationId: targetLocationId } });
    await tx.stocktakeSession.updateMany({ where: { scopeType: "LOCATION", scopeValue: from.name, status: { in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"] } }, data: { scopeValue: to.name, scopeLabel: to.name } });
    await tx.storageLocation.delete({ where: { id: sourceLocationId } });
    await tx.adminActionLog.create({ data: { adminUserId: actorId, action: "CLASSIFICATION_MERGE_LOCATION", route: "/admin/classifications", detail: { sourceLocationId, targetLocationId, moved, consolidated } } });
    return { moved, consolidated };
  }, { timeout: 30_000, isolationLevel: "Serializable" });
}

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request); if (auth.response) return auth.response;
  try {
    const [masters, items, locations] = await prisma.$transaction(tx=>Promise.all([
      tx.classification.findMany({ orderBy: [{ kind: "asc" }, { parentName: "asc" }, { name: "asc" }] }),
      tx.item.findMany({ where: { isArchived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, janCode: true, systemBarcode: true, majorCategory: true, minorCategory: true, managementCode:true, defaultUnit:true, inventoryInstances: { select: { id:true, quantity: true, unit:true, storageLocationId:true } }, _count: { select: { inventoryInstances: true } } } }),
      tx.storageLocation.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { inventories: true, itemRegistrationRequests: true } } } }),
    ]),{isolationLevel:"RepeatableRead"});
    const usage = new Map<string, { itemCount: number; inventoryCount: number }>();
    for (const item of items) {
      if (item.majorCategory) { const key = `MAJOR::${item.majorCategory}`; const row = usage.get(key) ?? { itemCount: 0, inventoryCount: 0 }; row.itemCount += 1; row.inventoryCount += item._count.inventoryInstances; usage.set(key, row); }
      if (item.minorCategory) { const key = `MINOR:${item.majorCategory ?? ""}:${item.minorCategory}`; const row = usage.get(key) ?? { itemCount: 0, inventoryCount: 0 }; row.itemCount += 1; row.inventoryCount += item._count.inventoryInstances; usage.set(key, row); }
    }
    const derived = Array.from(usage).map(([key, counts]) => { const [kind, parentName, ...nameParts] = key.split(":"); return { id: `derived-${key}`, kind, parentName: kind === "MAJOR" ? "" : parentName, name: nameParts.join(":"), ...counts }; });
    const rows = new Map<string, { id: string; labelCode?: string; kind: string; name: string; parentName: string; itemCount: number; inventoryCount: number }>();
    for (const row of masters) rows.set(`${row.kind}:${row.parentName}:${row.name}`, { ...row, itemCount: 0, inventoryCount: 0 });
    for (const row of derived) rows.set(`${row.kind}:${row.parentName}:${row.name}`, { ...(rows.get(`${row.kind}:${row.parentName}:${row.name}`) ?? row), itemCount: row.itemCount, inventoryCount: row.inventoryCount });
    return NextResponse.json({ classifications: Array.from(rows.values()), locations, items: items.map((item) => ({ id: item.id, name: item.name, managementCode:item.managementCode, inventoryInstances:item.inventoryInstances, janCode: item.janCode, systemBarcode: item.systemBarcode, majorCategory: item.majorCategory, minorCategory: item.minorCategory, inventoryCount: item._count.inventoryInstances, quantityLabel:summarizeStock(item.inventoryInstances,item.defaultUnit).map(row=>row.quantity+" "+row.unit).join(" ／ "), totalQuantity: item.inventoryInstances.reduce((sum, row) => sum + row.quantity, 0) })) });
  } catch (error) { console.error("GET classifications", error); return NextResponse.json({ code: "CLASSIFICATION_LIST_FAILED", message: "分類・保管場所を取得できませんでした。", action: "自動再読込後も解決しない場合はシステム点検を実行してください。" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request); if (auth.response || !auth.user) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 40), kind = text(body.kind, 20), name = text(body.name), parentName = text(body.parentName), source = text(body.source), target = text(body.target), targetParent = text(body.targetParent);
    let result: unknown;
    if (action === "CREATE_CLASSIFICATION") {
      if (!["MAJOR", "MINOR"].includes(kind) || !name || (kind === "MINOR" && !parentName)) return NextResponse.json({ code: "CLASSIFICATION_INPUT_INVALID", message: "分類名と親分類を確認してください。" }, { status: 400 });
      result = await prisma.$transaction(async (tx) => {
        await ensureClassification(tx, kind === "MAJOR" ? name : parentName, kind === "MINOR" ? name : null);
        return { created: true };
      });
    } else if (action === "RENAME_OR_MERGE_CLASSIFICATION") {
      if (!["MAJOR", "MINOR"].includes(kind) || !source || !target) return NextResponse.json({ code: "CLASSIFICATION_INPUT_INVALID", message: "変更元と変更先を指定してください。" }, { status: 400 });
      result = await prisma.$transaction(async (tx) => {
        if (kind === "MAJOR") {
          const linkedItems = await tx.item.findMany({ where: { majorCategory: source }, select: { id: true } });
          const items = await tx.item.updateMany({ where: { majorCategory: source }, data: { majorCategory: target } });
          const inventories = await tx.inventoryInstance.updateMany({ where: { OR: [{ majorCategory: source }, { itemId: { in: linkedItems.map((item) => item.id) } }] }, data: { majorCategory: target } });
          await tx.itemRegistrationRequest.updateMany({ where: { majorCategory: source, status: "PENDING" }, data: { majorCategory: target } });
          await tx.stocktakeSession.updateMany({ where: { scopeType: "MAJOR_CATEGORY", scopeValue: source, status: { in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"] } }, data: { scopeValue: target, scopeLabel: target } });
          const children = await tx.classification.findMany({ where: { kind: "MINOR", parentName: source } });
          for (const child of children) await renameClassificationMaster(tx, "MINOR", child.name, source, child.name, target);
          await renameClassificationMaster(tx, "MAJOR", source, "", target, "");
          return { items: items.count, inventories: inventories.count };
        }
        if (!parentName) throw new Error("小分類の変更には親の大分類を指定してください。");
        const otherParents = await tx.item.count({ where: { minorCategory: source, NOT: { majorCategory: parentName } } });
        const activeScope = await tx.stocktakeSession.count({ where: { scopeType: "MINOR_CATEGORY", scopeValue: source, status: { in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"] } } });
        if (source !== target && otherParents && activeScope) throw new Error("同名の小分類をまとめて棚卸中です。棚卸の完了後に小分類名を変更してください。");
        const where = { minorCategory: source, majorCategory: parentName };
        const nextMajor = targetParent || parentName;
        const linkedItems = await tx.item.findMany({ where, select: { id: true } });
        const items = await tx.item.updateMany({ where, data: { minorCategory: target, majorCategory: nextMajor } });
        const inventories = await tx.inventoryInstance.updateMany({ where: { OR: [where, { itemId: { in: linkedItems.map((item) => item.id) } }] }, data: { minorCategory: target, majorCategory: nextMajor } });
        await tx.itemRegistrationRequest.updateMany({ where: { ...where, status: "PENDING" }, data: { minorCategory: target, majorCategory: nextMajor } });
        if (!otherParents) await tx.stocktakeSession.updateMany({ where: { scopeType: "MINOR_CATEGORY", scopeValue: source, status: { in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"] } }, data: { scopeValue: target, scopeLabel: target } });
        await ensureClassification(tx, nextMajor, null);
        await renameClassificationMaster(tx, "MINOR", source, parentName, target, nextMajor);
        return { items: items.count, inventories: inventories.count };
      });
    } else if (action === "ASSIGN_ITEMS") {
      const itemIds = Array.isArray(body.itemIds) ? Array.from(new Set(body.itemIds.filter((value): value is string => typeof value === "string" && value.length > 0))) : [];
      if (itemIds.length > 500) return NextResponse.json({ code: "CLASSIFICATION_BATCH_LIMIT", message: "一度に変更できるのは500件までです。選択を減らして実行してください。" }, { status: 400 });
      const hasMajor = Object.prototype.hasOwnProperty.call(body, "majorCategory");
      const hasMinor = Object.prototype.hasOwnProperty.call(body, "minorCategory");
      const majorCategory = body.majorCategory === null ? null : text(body.majorCategory);
      const minorCategory = body.minorCategory === null ? null : text(body.minorCategory);
      if (itemIds.length === 0 || (!hasMajor && !hasMinor)) return NextResponse.json({ code: "CLASSIFICATION_ITEMS_REQUIRED", message: "編集する商品と変更内容を選択してください。" }, { status: 400 });
      if (hasMinor && minorCategory && !(hasMajor ? majorCategory : text(body.currentMajor))) return NextResponse.json({ code: "CLASSIFICATION_PARENT_REQUIRED", message: "小分類を設定する場合は大分類も選択してください。" }, { status: 400 });
      result = await prisma.$transaction(async (tx) => {
        const selected = await tx.item.findMany({ where: { id: { in: itemIds }, isArchived: false }, select: { id: true, majorCategory: true, minorCategory: true } });
        if (selected.length !== itemIds.length) throw new Error("CLASSIFICATION_ITEMS_CHANGED");
        for (const item of selected) {
          const nextMajor = hasMajor ? majorCategory : item.majorCategory;
          const nextMinor = hasMinor ? minorCategory : (hasMajor && majorCategory !== item.majorCategory ? null : item.minorCategory);
          await ensureClassification(tx, nextMajor, nextMinor);
          await tx.item.update({ where: { id: item.id }, data: { majorCategory: nextMajor, minorCategory: nextMinor } });
          await tx.inventoryInstance.updateMany({ where: { itemId: item.id }, data: { majorCategory: nextMajor, minorCategory: nextMinor } });
        }
        return { updatedItems: selected.length, requestedItems: itemIds.length };
      });
    } else if (action === "DELETE_CLASSIFICATION") {
      const used = kind === "MAJOR" ? await prisma.item.count({ where: { majorCategory: source } }) : await prisma.item.count({ where: { minorCategory: source, ...(parentName ? { majorCategory: parentName } : {}) } });
      if (used > 0) return NextResponse.json({ code: "CLASSIFICATION_IN_USE", message: `${used}件の商品が使用中です。削除ではなく統合または移動を実行してください。` }, { status: 409 });
      result = await prisma.classification.deleteMany({ where: { kind, name: source, ...(kind === "MINOR" ? { parentName } : {}) } });
    } else if (action === "CREATE_LOCATION") {
      if (!name) return NextResponse.json({ code: "LOCATION_NAME_REQUIRED", message: "保管場所名を入力してください。" }, { status: 400 });
      result = await prisma.storageLocation.upsert({ where: { name }, update: { description: text(body.description, 500) || null }, create: { name, description: text(body.description, 500) || null } });
    } else if (action === "RENAME_LOCATION") {
      const sourceId = text(body.sourceId); if (!sourceId || !target) return NextResponse.json({ code: "LOCATION_INPUT_INVALID", message: "変更元と新しい名称を指定してください。" }, { status: 400 });
      const before = await prisma.storageLocation.findUnique({ where: { id: sourceId } }); if (!before) return NextResponse.json({ code: "LOCATION_NOT_FOUND", message: "保管場所が見つかりません。" }, { status: 404 });
      result = await prisma.$transaction([prisma.storageLocation.update({ where: { id: sourceId }, data: { name: target, description: text(body.description, 500) || before.description } }), prisma.stocktakeSession.updateMany({ where: { scopeType: "LOCATION", scopeValue: before.name, status: { in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"] } }, data: { scopeValue: target, scopeLabel: target } })]);
    } else if (action === "MERGE_LOCATION") {
      const sourceId = text(body.sourceId), targetId = text(body.targetId); if (!sourceId || !targetId || sourceId === targetId) return NextResponse.json({ code: "LOCATION_MERGE_INVALID", message: "異なる統合元と統合先を指定してください。" }, { status: 400 });
      result = await mergeInventory(sourceId, targetId, auth.user.id);
    } else return NextResponse.json({ code: "CLASSIFICATION_ACTION_INVALID", message: "編集操作が正しくありません。" }, { status: 400 });
    if (action !== "MERGE_LOCATION") await createAdminActionLog({ adminUserId: auth.user.id, action: `CLASSIFICATION_${action}`, route: "/admin/classifications", detail: { kind, name, parentName, source, target, targetParent, result: result as never } });
    return NextResponse.json({ code: "CLASSIFICATION_UPDATE_OK", message: "分類・在庫・棚卸範囲を更新し、操作履歴へ記録しました。", result });
  } catch (error) { console.error("POST classifications", error);
    if (error && typeof error === "object" && (("code" in error && ["P2034", "P2025"].includes(String(error.code))) || (error instanceof Error && ["LOCATION_CHANGED", "CLASSIFICATION_ITEMS_CHANGED"].includes(error.message)))) return NextResponse.json({ code: "CLASSIFICATION_CHANGED", message: "他の操作で情報が変わりました。再読込してから実行してください。" }, { status: 409 }); return NextResponse.json({ code: "CLASSIFICATION_UPDATE_FAILED", message: error instanceof Error && (error.message.startsWith("小分類の変更") || error.message.startsWith("同名の小分類")) ? error.message : "分類編集を完了できませんでした。現在の状態を再読込して確認してください。", action: "入力内容を確認して再試行し、解決しない場合はエラー管理を開いてください。" }, { status: 500 }); }
}
