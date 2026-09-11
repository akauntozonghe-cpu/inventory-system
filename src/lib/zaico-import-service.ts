import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decideZaicoRow, normalizeZaicoRow, rowProblem, validJan, type ZaicoRow, type ImportCandidate } from "./zaico-import";

export const importKey = (row: ZaicoRow) => createHash("sha256").update(JSON.stringify(normalizeZaicoRow(row))).digest("hex");
export type ReviewInput = { id: string; row: ZaicoRow; mode: "AUTO" | "NEW_NO_JAN" | "LINK" | "SKIP"; itemId?: string };
const selection = { id: true, name: true, janCode: true, isArchived: true } as const;

export async function previewZaico(rows: ZaicoRow[]) {
  const [existing, records] = await Promise.all([
    prisma.item.findMany({ select: selection }),
    prisma.zaicoImportRecord.findMany({ where: { key: { in: rows.map(importKey) } } }),
  ]);
  const items: ImportCandidate[] = [...existing];
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const key = importKey(row), prior = records.find(record => record.key === key);
    if (prior || seen.has(key)) return { row, rowNumber: index + 2, status: "SKIPPED", reason: prior?.status === "PENDING" ? "保存済みの確認待ちにあります。下の一覧で処理できます。" : "同じ内容は登録済み、またはファイル内で重複しています。", candidates: [] };
    seen.add(key);
    const decision = decideZaicoRow(row, items);
    if (decision.status === "CREATE") items.push({ id: `preview-${index}`, name: row.name, janCode: row.janCode, isArchived: false });
    return { row, rowNumber: index + 2, ...decision };
  });
}

export async function processZaico(input: { rows?: ZaicoRow[]; reviews?: ReviewInput[] }, userId: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        // Serialize imports even when the source contains no barcode or nullable location.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(9120260911::bigint)`;
        const items = await tx.item.findMany({ select: selection });
        const newStocks: { id: string; locationId: string | null; category: string; quantity: number }[] = [];
        const results: { id: string; status: string; reason: string }[] = [];
        const entries = input.reviews ?? (input.rows ?? []).map(row => ({ row, mode: "AUTO" as const, id: "" }));
        for (const entry of entries) {
          const row = normalizeZaicoRow(entry.row);
          const prior = entry.id
            ? await tx.zaicoImportRecord.findUnique({ where: { id: entry.id } })
            : await tx.zaicoImportRecord.findUnique({ where: { key: importKey(row) } });
          if (entry.id && !prior) throw new Error("IMPORT_REVIEW_NOT_FOUND");
          if (prior && (!entry.id || prior.status !== "PENDING")) {
            results.push({ id: prior.id, status: "SKIPPED", reason: "この内容は保存済みです。" });
            continue;
          }
          let decision = decideZaicoRow(row, items, entry.mode === "NEW_NO_JAN");
          if (entry.mode === "LINK") {
            const target = decision.candidates.find(item => item.id === entry.itemId && !item.isArchived);
            if (!target || !validJan(row.janCode) || rowProblem(row)) decision = { ...decision, status: "PENDING", reason: "有効なJAN一致先と入力内容を確認してください。" };
            else decision = { ...decision, status: "LINK", itemId: target.id, reason: "選択したJAN一致商品に紐付けました。在庫数量は変更していません。" };
          }
          const status: string = entry.mode === "SKIP" ? "SKIPPED" : decision.status === "CREATE" ? "CREATED" : decision.status === "LINK" ? "LINKED" : "PENDING";
          let itemId = decision.itemId ?? null, inventoryId: string | null = null;
          if (status === "CREATED") {
            const item = await tx.item.create({ data: { name: row.name, janCode: row.janCode || null, systemBarcode: row.janCode ? null : `SYS-${randomUUID().replaceAll("-", "").slice(0, 18).toUpperCase()}`, defaultUnit: row.unit, majorCategory: row.majorCategory || null }, select: selection });
            items.push(item);
            itemId = item.id;
            const location = row.storageLocation ? await tx.storageLocation.upsert({ where: { name: row.storageLocation }, create: { name: row.storageLocation }, update: {} }) : null;
            const quantity = Number(row.quantity);
            const inventory = await tx.inventoryInstance.create({ data: { itemId, storageLocationId: location?.id ?? null, majorCategory: row.majorCategory || null, quantity, actualQuantity: quantity, unit: row.unit, allocationType: "home", status: "在庫中", stocktakeStatus: "未棚卸", expirationDate: null, expirationManagementStatus: "ACTIVE" } });
            inventoryId = inventory.id;
            newStocks.push({ id: inventory.id, locationId: location?.id ?? null, category: row.majorCategory, quantity });
            await tx.inventoryHistory.create({ data: { inventoryInstanceId: inventory.id, changeQuantity: quantity, action: "zaico CSV取込" } });
            await tx.inventoryEvent.create({ data: { inventoryInstanceId: inventory.id, eventType: "IMPORT", quantityBefore: 0, quantityChange: quantity, quantityAfter: quantity, performedByUserId: userId, reason: "zaico CSV取込" } });
          }
          const reason = status === "SKIPPED" ? "選択した行を取り込み対象から除外しました。" : status === "CREATED" ? "新規在庫として登録しました。棚卸で現物を確認してください。" : decision.reason;
          const data = { row: row as unknown as Prisma.InputJsonValue, status, reason, itemId, inventoryId, reviewedByUserId: userId };
          const record = prior ? await tx.zaicoImportRecord.update({ where: { id: prior.id }, data }) : await tx.zaicoImportRecord.create({ data: { ...data, key: importKey(row), originalRow: row as unknown as Prisma.InputJsonValue } });
          results.push({ id: record.id, status, reason });
        }
        if (newStocks.length) {
          const sessions = await tx.stocktakeSession.findMany({ where: { status: { in: ["IN_PROGRESS", "PAUSED"] } }, select: { id: true, status: true, scopeType: true, scopeValue: true } });
          for (const session of sessions) {
            const stocks = newStocks.filter(stock => session.scopeType === "ALL" || session.scopeType === "LOCATION" && stock.locationId !== null && stock.locationId === session.scopeValue || session.scopeType === "MAJOR_CATEGORY" && stock.category !== "" && stock.category === session.scopeValue);
            if (!stocks.length) continue;
            const claimed = await tx.stocktakeSession.updateMany({ where: { id: session.id, status: session.status }, data: { updatedAt: new Date() } });
            if (claimed.count !== 1) throw new Error("IMPORT_STOCKTAKE_CHANGED");
            await tx.stocktakeTarget.createMany({ data: stocks.map(stock => ({ sessionId: session.id, inventoryInstanceId: stock.id, expectedQuantity: stock.quantity })), skipDuplicates: true });
          }
        }
        const summary = { created: results.filter(r => r.status === "CREATED").length, linked: results.filter(r => r.status === "LINKED").length, pending: results.filter(r => r.status === "PENDING").length, skipped: results.filter(r => r.status === "SKIPPED").length };
        await tx.adminActionLog.create({ data: { adminUserId: userId, action: "ZAICO_IMPORT", route: "/api/admin/import-zaico", detail: summary } });
        return { results, ...summary };
      }, { isolationLevel: "Serializable", maxWait: 15000, timeout: 60000 });
    } catch (error) {
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) continue;
      throw error;
    }
  }
}
