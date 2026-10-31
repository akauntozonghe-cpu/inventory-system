import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getAdminElevation } from "@/lib/auth";

const labels = { DELETE: "削除", EXCLUDE_INSPECTION: "棚卸・点検対象外に設定", INCLUDE_INSPECTION: "棚卸・点検対象に復帰" } as const;
type Candidate = { id: string; name: string; eligible: boolean; reasons: string[]; stockIds: string[] };
type StockForCheck = {
 id: string; itemId: string; histories: { action: string }[];
 _count: { stocktakeRecords: number; stocktakeTargets: number; inventoryEvents: number; marketplaceListings: number };
};
function classify(items: { id: string; name: string }[], stocks: StockForCheck[]): Candidate[] {
 return items.map(item => {
  const related = stocks.filter(stock => stock.itemId === item.id);
  const reasons = new Set<string>();
  for (const stock of related) {
   if (stock._count.stocktakeRecords || stock._count.stocktakeTargets) reasons.add("棚卸記録あり");
   if (stock._count.inventoryEvents || stock.histories.some(history => history.action !== "初回在庫登録")) reasons.add("入出庫・修正履歴あり");
   if (stock._count.marketplaceListings) reasons.add("フリマ出品記録あり");
  }
  return { id: item.id, name: item.name, eligible: reasons.size === 0, reasons: [...reasons], stockIds: related.map(stock => stock.id) };
 });
}
const stockSelect = { id: true, itemId: true, histories: { select: { action: true } }, _count: { select: { stocktakeRecords: true, stocktakeTargets: true, inventoryEvents: true, marketplaceListings: true } } } as const;

export async function POST(request: NextRequest) {
 const auth = requireAdmin(request);
 if (auth.response || !auth.user) return auth.response;
 const input = await request.json().catch(() => null);
 const action = input?.operation as keyof typeof labels;
 const ids: string[] = Array.isArray(input?.itemIds) ? [...new Set<string>(input.itemIds.filter((id: unknown) => typeof id === "string" && id.trim()))] : [];
 const preview = action === "DELETE" && input?.preview === true;
 const onlyEligible = input?.onlyEligible === true;
 const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
 if (!Object.hasOwn(labels, action) || !ids.length || ids.length > 1000 || (!preview && (reason.length < 2 || reason.length > 500))) {
  return NextResponse.json({ code: "ITEM_BULK_INPUT_INVALID", message: "対象商品と操作、2～500文字の理由を指定してください。" }, { status: 400 });
 }
 try {
  const result = await prisma.$transaction(async tx => {
   const items = await tx.item.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, isArchived: true, inspectionExcluded: true, inspectionExclusionReason: true } });
   if (items.length !== ids.length) throw new Error("ITEMS_CHANGED");
   if (action === "DELETE") {
    const active = items.filter(item => !item.isArchived);
    if (preview) return { preview: true, eligible: active.map(item => ({ id: item.id, name: item.name })), blocked: [], eligibleCount: active.length, blockedCount: 0 };
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
  if (error instanceof Error && error.message === "NOTHING_ELIGIBLE") return NextResponse.json({ code: "NOTHING_ELIGIBLE", message: "削除可能な商品はありません。" }, { status: 409 });
  return NextResponse.json({ code: "ITEM_BULK_FAILED", message: "一括操作に失敗しました。最新情報を再取得して確認してください。" }, { status: 409 });
 }
}
