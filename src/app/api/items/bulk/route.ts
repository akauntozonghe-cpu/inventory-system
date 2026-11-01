import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getAdminElevation } from "@/lib/auth";
import { syncItemLinks } from "@/lib/item-links";

const labels = { DELETE: "削除", RESTORE: "復元", EXCLUDE_INSPECTION: "棚卸・点検対象外に設定", INCLUDE_INSPECTION: "棚卸・点検対象に復帰", SET_MANUFACTURER: "メーカーを変更", SET_MAJOR_CATEGORY: "大分類を変更", SET_MINOR_CATEGORY: "小分類を変更", SET_UNIT: "既定単位を変更" } as const;
export async function POST(request: NextRequest) {
 const auth = requireAdmin(request);
 if (auth.response || !auth.user) return auth.response;
 const input = await request.json().catch(() => null);
 const action = input?.operation as keyof typeof labels;
 const ids: string[] = Array.isArray(input?.itemIds) ? [...new Set<string>(input.itemIds.filter((id: unknown) => typeof id === "string" && id.trim()))] : [];
 const preview = action === "DELETE" && input?.preview === true;
 const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
 if (!Object.hasOwn(labels, action) || !ids.length || ids.length > 1000 || (!preview && (reason.length < 2 || reason.length > 500))) {
  return NextResponse.json({ code: "ITEM_BULK_INPUT_INVALID", message: "対象商品と操作、2～500文字の理由を指定してください。" }, { status: 400 });
 }
 try {
  const result = await prisma.$transaction(async tx => {
   const items = await tx.item.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, isArchived: true, inspectionExcluded: true, inspectionExclusionReason: true, manufacturer: true, majorCategory: true, minorCategory: true, defaultUnit: true } });
   if (items.length !== ids.length) throw new Error("ITEMS_CHANGED");
   if (action === "DELETE") {
    const active = items.filter(item => !item.isArchived);
    if (preview) {
     const blocked = items.filter(item => item.isArchived).map(item => ({ id: item.id, name: item.name, reasons: ["すでに削除済み"] }));
     return { preview: true, eligible: active.map(item => ({ id: item.id, name: item.name })), blocked, eligibleCount: active.length, blockedCount: blocked.length };
    }
    if (!active.length) throw new Error("NOTHING_ELIGIBLE");
    const changed = await tx.item.updateMany({
     where: { id: { in: active.map(item => item.id) }, isArchived: false },
     data: { isArchived: true, archivedAt: new Date(), archiveReason: reason },
    });
    if (changed.count !== active.length) throw new Error("ITEMS_CHANGED");
    const actor = (auth.user!.baseRole ?? auth.user!.role) === "ADMIN" ? auth.user!.id : getAdminElevation(request)?.adminUserId;
    if (!actor) throw new Error("ADMIN_REQUIRED");
    await tx.adminActionLog.create({ data: { adminUserId: actor, action: "ITEM_BULK_SOFT_DELETE", route: "/items", detail: { reason, itemIds: active.map(item => item.id), requestedBy: auth.user!.id } } });
    return { success: true, summary: { affectedCount: changed.count }, message: changed.count + "件を削除済みにしました。履歴は保存されています。" };
   }
   if (action === "RESTORE") {
    const deleted = items.filter(item => item.isArchived);
    if (!deleted.length) throw new Error("NOTHING_TO_RESTORE");
    const changed = await tx.item.updateMany({
     where: { id: { in: deleted.map(item => item.id) }, isArchived: true },
     data: { isArchived: false, archivedAt: null, archiveReason: null },
    });
    if (changed.count !== deleted.length) throw new Error("ITEMS_CHANGED");
    const actor = (auth.user!.baseRole ?? auth.user!.role) === "ADMIN" ? auth.user!.id : getAdminElevation(request)?.adminUserId;
    if (!actor) throw new Error("ADMIN_REQUIRED");
    await tx.adminActionLog.create({ data: { adminUserId: actor, action: "ITEM_BULK_RESTORE", route: "/items", detail: { reason, itemIds: deleted.map(item => item.id), requestedBy: auth.user!.id } } });
    return { success: true, summary: { affectedCount: changed.count }, message: changed.count + "件を復元しました。個別に削除された在庫明細は引き続き削除済みです。" };
   }
   if (action === "SET_MANUFACTURER" || action === "SET_MAJOR_CATEGORY" || action === "SET_MINOR_CATEGORY" || action === "SET_UNIT") {
    const value = input?.value;
    const limits = { SET_MANUFACTURER: 200, SET_MAJOR_CATEGORY: 100, SET_MINOR_CATEGORY: 100, SET_UNIT: 30 };
    if (typeof value !== "string" || value.trim().length > limits[action]) throw new Error("VALUE_INVALID");
    const field = ({ SET_MANUFACTURER: "manufacturer", SET_MAJOR_CATEGORY: "majorCategory", SET_MINOR_CATEGORY: "minorCategory", SET_UNIT: "defaultUnit" } as const)[action];
    const active = items.filter(item => !item.isArchived);
    if (active.length !== items.length) throw new Error("ITEMS_DELETED");
    const newValue = value.normalize("NFKC").trim() || null;
    const data = action === "SET_MANUFACTURER" ? {manufacturer:newValue} : action === "SET_MAJOR_CATEGORY" ? {majorCategory:newValue} : action === "SET_MINOR_CATEGORY" ? {minorCategory:newValue} : {defaultUnit:newValue};
    // Preserve the distinction between shared catalog values and explicit
    // per-lot overrides. Update the item and its inherited stock references
    // within this same transaction.
    if (ids.length > 150) throw new Error("BULK_SYNC_LIMIT");
    let changedCount = 0;
    for (const item of items) {
      const updated = await tx.item.updateMany({ where: { id: item.id, isArchived: false }, data });
      if (updated.count !== 1) throw new Error("ITEMS_CHANGED");
      const after = {
        manufacturer: action === "SET_MANUFACTURER" ? newValue : item.manufacturer,
        majorCategory: action === "SET_MAJOR_CATEGORY" ? newValue : item.majorCategory,
        minorCategory: action === "SET_MINOR_CATEGORY" ? newValue : item.minorCategory,
        defaultUnit: action === "SET_UNIT" ? newValue : item.defaultUnit,
      };
      if (after.minorCategory && !after.majorCategory) throw new Error("CATEGORY_PARENT_REQUIRED");
      await syncItemLinks(tx, item.id, {
        manufacturer: item.manufacturer, majorCategory: item.majorCategory,
        minorCategory: item.minorCategory, defaultUnit: item.defaultUnit,
      }, after);
      changedCount++;
    }
    const changed = { count: changedCount };
    const actor = (auth.user!.baseRole ?? auth.user!.role) === "ADMIN" ? auth.user!.id : getAdminElevation(request)?.adminUserId;
    if (!actor) throw new Error("ADMIN_REQUIRED");
    await tx.adminActionLog.create({ data: { adminUserId: actor, action: "ITEM_BULK_" + action, route: "/items", detail: { reason, changes: items.map(item => ({ id: item.id, before: item[field], after: newValue })), requestedBy: auth.user!.id } } });
    return { success: true, summary: { affectedCount: changed.count }, message: changed.count + "件の" + labels[action] + "を完了しました。各在庫明細の個別設定は変更していません。" };
   }
   const data = action === "EXCLUDE_INSPECTION" ? { inspectionExcluded: true, inspectionExclusionReason: reason } : { inspectionExcluded: false, inspectionExclusionReason: null };
   await tx.inventoryInstance.updateMany({ where: { itemId: { in: ids } }, data: { inspectionExcluded: action === "EXCLUDE_INSPECTION", inspectionExclusionReason: action === "EXCLUDE_INSPECTION" ? reason : null } });
   const updated = await tx.item.updateMany({ where: { id: { in: ids } }, data });
   const actor = (auth.user!.baseRole ?? auth.user!.role) === "ADMIN" ? auth.user!.id : getAdminElevation(request)?.adminUserId;
   if (!actor) throw new Error("ADMIN_REQUIRED");
   await tx.adminActionLog.create({ data: { adminUserId: actor, action: "ITEM_BULK_" + action, route: "/items", detail: { reason, before: items, after: data, requestedBy: auth.user!.id } } });
   return { success: true, summary: { affectedCount: updated.count }, message: `${updated.count}件の商品を${labels[action]}しました。` };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
  return NextResponse.json(result);
 } catch (error) {
  if (error instanceof Error && error.message === "DELETE_PROTECTED") return NextResponse.json({ code: "DELETE_PROTECTED", message: "削除できない商品が含まれています。削除前の確認画面を更新してください。" }, { status: 409 });
  if (error instanceof Error && ["CATEGORY_PARENT_REQUIRED","BULK_SYNC_LIMIT"].includes(error.message)) return NextResponse.json({code:error.message,message:error.message==="BULK_SYNC_LIMIT"?"一度に変更する商品は150件以内にしてください。":"小分類を設定する場合は大分類が必要です。"}, {status:400});
  if (error instanceof Error && (error.message === "VALUE_INVALID" || error.message === "ITEMS_DELETED")) return NextResponse.json({ code: error.message, message: "変更値または削除済みの商品が含まれています。対象を確認してください。" }, { status: 400 });
  if (error instanceof Error && error.message === "NOTHING_TO_RESTORE") return NextResponse.json({ code: "NOTHING_TO_RESTORE", message: "選択商品に復元する削除済みデータはありません。" }, { status: 409 });
  if (error instanceof Error && error.message === "NOTHING_ELIGIBLE") return NextResponse.json({ code: "NOTHING_ELIGIBLE", message: "削除可能な商品はありません。" }, { status: 409 });
  return NextResponse.json({ code: "ITEM_BULK_FAILED", message: "一括操作に失敗しました。最新情報を再取得して確認してください。" }, { status: 409 });
 }
}
