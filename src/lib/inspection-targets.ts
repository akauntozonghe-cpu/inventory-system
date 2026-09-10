import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { unitValidationMessage } from "./unit";
import { targetChecks, type InspectionTarget } from "./inspection-target-types";
const shown = (value: unknown) => value === null || value === undefined || value === "" ? "未設定" : String(value);
export async function inspectionTargets(code: string, sessionId: string | null, cursor: string | null) {
    if (!targetChecks.includes(code as typeof targetChecks[number]))
        throw new Error("CHECK_NOT_SUPPORTED");
    if (code === "CHECK_REVIEW_RECORDS" || code === "CHECK_STOCKTAKE_LEGACY_STATE") {
        const rows = await prisma.stocktakeSession.findMany({ where: { ...(sessionId ? { id: sessionId } : {}), ...(cursor ? { id: { ...(sessionId ? { equals: sessionId } : {}), gt: cursor } } : {}), ...(code === "CHECK_REVIEW_RECORDS" ? { status: "REVIEW", records: { none: {} } } : { status: "CONFLICT" }) }, orderBy: { id: "asc" }, take: 51, include: { operatorUser: { select: { displayName: true, username: true } }, _count: { select: { targets: true, records: true } } } });
        return { targets: rows.slice(0, 50).map(row => ({ id: row.id, sessionId: row.id, name: row.title, owner: row.operatorUser?.displayName ?? row.operator ?? "担当者未設定", status: row.status, updatedAt: row.updatedAt.toISOString(), current: `保存済み入力 ${row._count.records}件 / 対象 ${row._count.targets}件`, expected: "担当者が続きを入力できる状態", instruction: row.status === "CONFLICT" ? "過去の停止状態です。別ユーザーの棚卸があること自体は異常ではありません。記録を残して、この担当者の棚卸だけを再開できます。" : "入力記録がないまま確認待ちになっています。この棚卸だけを再開し、元の担当者が続きを入力してください。", href: `/stocktake/${row.id}/result` }) satisfies InspectionTarget), nextCursor: rows.length > 50 ? rows[49].id : null };
    }
    if (code === "CHECK_STOCKTAKE_TARGET_LINK") {
        // A target belongs to its own session. Another user's target must not hide a missing link.
        const ids = await prisma.$queryRaw<Array<{
            id: string;
        }>>(Prisma.sql `SELECT r.id FROM "StocktakeRecord" r JOIN "InventoryInstance" v ON v.id=r."inventoryInstanceId" JOIN "Item" i ON i.id=v."itemId" WHERE i."isArchived"=false AND i."inspectionExcluded"=false AND v.status<>'廃止' AND NOT EXISTS(SELECT 1 FROM "StocktakeTarget" t WHERE t."sessionId"=r."sessionId" AND t."inventoryInstanceId"=r."inventoryInstanceId") ${sessionId ? Prisma.sql `AND r."sessionId"=${sessionId}` : Prisma.empty} ${cursor ? Prisma.sql `AND r.id>${cursor}` : Prisma.empty} ORDER BY r.id LIMIT 51`);
        const records = await prisma.stocktakeRecord.findMany({ where: { id: { in: ids.slice(0, 50).map(x => x.id) } }, orderBy: { id: "asc" }, include: { session: { include: { operatorUser: { select: { displayName: true } } } }, inventoryInstance: { include: { item: true, storageLocation: true } } } });
        return { targets: records.map(row => ({ id: row.id, sessionId: row.sessionId, itemId: row.inventoryInstance.itemId, inventoryId: row.inventoryInstanceId, name: `${row.session.title}：${row.inventoryInstance.item.name}`, owner: row.session.operatorUser?.displayName ?? row.session.operator ?? "担当者未設定", status: row.session.status, lot: row.inventoryInstance.lotNo, location: row.inventoryInstance.storageLocation?.name, updatedAt: row.updatedAt.toISOString(), sessionUpdatedAt: row.session.updatedAt.toISOString(), current: `入力 ${row.countedQuantity} / この棚卸の対象登録なし`, expected: "同じ担当者の棚卸内で、入力記録と対象が対応すること", instruction: "他の担当者の記録とは別です。開始時の基準数量を記録から確認して入力すると、この保存記録を対象へ戻せます。現在在庫や数えた数量からは推測しません。", href: `/stocktake/${row.sessionId}/result?inventoryId=${row.inventoryInstanceId}`, action: "RESTORE_TARGET" }) satisfies InspectionTarget), nextCursor: ids.length > 50 ? ids[49].id : null };
    }
    const condition = code === "CHECK_PRODUCT_LINKS" ? Prisma.sql `(v."majorCategory" IS DISTINCT FROM i."majorCategory" OR v."minorCategory" IS DISTINCT FROM i."minorCategory" OR v.manufacturer IS DISTINCT FROM i.manufacturer)` :
        code === "CHECK_PRODUCT_IDENTIFIERS" ? Prisma.sql `(NULLIF(BTRIM(i."janCode"),'') IS NULL AND NULLIF(BTRIM(i."systemBarcode"),'') IS NULL)` :
            code === "CHECK_DUPLICATE_PRODUCTS" ? Prisma.sql `(i."systemBarcode" IS NOT NULL AND EXISTS(SELECT 1 FROM "Item" other WHERE other.id<>i.id AND other."isArchived"=false AND other."inspectionExcluded"=false AND other."systemBarcode"=i."systemBarcode"))` :
                Prisma.sql `((v.unit IS NOT NULL AND (BTRIM(v.unit)='' OR LENGTH(v.unit)>30 OR translate(v.unit,'０１２３４５６７８９．，＋－','0123456789.,+-') ~ '^[0-9[:space:].,+-]+$')) OR (i."defaultUnit" IS NOT NULL AND (BTRIM(i."defaultUnit")='' OR LENGTH(i."defaultUnit")>30 OR translate(i."defaultUnit",'０１２３４５６７８９．，＋－','0123456789.,+-') ~ '^[0-9[:space:].,+-]+$')))`;
    const ids = await prisma.$queryRaw<Array<{
        id: string;
    }>>(Prisma.sql `SELECT v.id FROM "InventoryInstance" v JOIN "Item" i ON i.id=v."itemId" WHERE i."isArchived"=false AND i."inspectionExcluded"=false AND v.status<>'廃止' AND ${condition} ${cursor ? Prisma.sql `AND v.id>${cursor}` : Prisma.empty} ORDER BY v.id LIMIT 51`);
    const rows = await prisma.inventoryInstance.findMany({ where: { id: { in: ids.slice(0, 50).map(x => x.id) } }, orderBy: { id: "asc" }, include: { item: true, storageLocation: true } });
    return { targets: rows.filter(row => code !== "CHECK_INVALID_UNITS" || unitValidationMessage(row.unit) || unitValidationMessage(row.item.defaultUnit)).map(row => {
            const differences = (["majorCategory", "minorCategory", "manufacturer"] as const).filter(key => row[key] !== row.item[key]).map(key => ({ field: ({ majorCategory: "大分類", minorCategory: "小分類", manufacturer: "メーカー" })[key], before: row[key], after: row.item[key] }));
            const base = { id: row.id, itemId: row.itemId, inventoryId: row.id, name: row.item.name, lot: row.lotNo, location: row.storageLocation?.name, updatedAt: row.updatedAt.toISOString(), itemUpdatedAt: row.item.updatedAt.toISOString(), href: `/items/${row.itemId}?inventoryId=${row.id}#inventory-${row.id}` };
            if (code === "CHECK_PRODUCT_LINKS")
                return { ...base, differences, current: "関連在庫と商品情報が一致していません", expected: "下記の変更後の値（商品情報）", instruction: "この在庫明細だけを、表示した商品情報へ揃えます。数量・Lot・他ユーザーの棚卸入力は変えません。", action: "SYNC_PRODUCT_METADATA" } satisfies InspectionTarget;
            if (code === "CHECK_INVALID_UNITS")
                return { ...base, editProduct: Boolean(unitValidationMessage(row.item.defaultUnit)), current: `在庫単位：${shown(row.unit)} / 商品の標準単位：${shown(row.item.defaultUnit)}`, expected: "個・箱など実際に数える単位の名称", instruction: unitValidationMessage(row.item.defaultUnit) ? "商品の標準単位が不正です。「この商品の情報を修正」で標準単位を修正してください。必要なら、この在庫明細の単位も修正します。" : "このLotの数量単位を下で選んで保存します。数量そのものは変えません。", action: unitValidationMessage(row.item.defaultUnit) ? undefined : "SET_UNIT" } satisfies InspectionTarget;
            return { ...base, editProduct: true, current: code === "CHECK_PRODUCT_IDENTIFIERS" ? "JAN・システムJANとも未設定" : `システムJAN：${shown(row.item.systemBarcode)}`, expected: "JAN、またはJANのない商品にシステムJAN", instruction: code === "CHECK_PRODUCT_IDENTIFIERS" ? "商品にJANがあるなら商品情報に入力してください。JANがないことを確認した商品だけ、下の発行を使います。" : "管理No.で別商品か確認してください。印刷済みコードを一括で変更しません。", action: code === "CHECK_PRODUCT_IDENTIFIERS" ? "ISSUE_SYSTEM_BARCODE" : undefined } satisfies InspectionTarget;
        }), nextCursor: ids.length > 50 ? ids[49].id : null };
}
