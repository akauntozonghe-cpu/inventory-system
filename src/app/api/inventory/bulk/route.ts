import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin, getAdminElevation } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Target = { id: string; expectedUpdatedAt: string };
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;
  const body = await request.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const scope = body?.scope;
  const selectedIds: string[] = Array.isArray(body?.selectedIds) ? body.selectedIds : [];
  const snapshots: Target[] = Array.isArray(body?.snapshots) ? body.snapshots : [];
  if (!itemId || !["selected", "unselected"].includes(scope) || !selectedIds.length ||
      selectedIds.length > 1000 || new Set(selectedIds).size !== selectedIds.length ||
      selectedIds.some(id => typeof id !== "string" || !id) ||
      !snapshots.length || snapshots.length > 1000 ||
      snapshots.some(s => !s || typeof s.id !== "string" || typeof s.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(s.expectedUpdatedAt))) ||
      new Set(snapshots.map(s => s.id)).size !== snapshots.length ||
      reason.length < 2 || reason.length > 500) {
    return NextResponse.json({ code: "BULK_INPUT_INVALID", message: "対象の選択、更新情報、2文字以上の変更理由を確認してください。" }, { status: 400 });
  }
  const snapshotIds = new Set(snapshots.map(s => s.id));
  if (selectedIds.some(id => !snapshotIds.has(id))) return NextResponse.json({ code: "INVALID_SELECTION", message: "選択対象が現在の在庫一覧と一致しません。" }, { status: 400 });
  const targets = snapshots.filter(s => scope === "selected" ? selectedIds.includes(s.id) : !selectedIds.includes(s.id));
  if (!targets.length) return NextResponse.json({ code: "NO_TARGET", message: "操作する在庫がありません。" }, { status: 400 });
  try {
    const result = await prisma.$transaction(async tx => {
      const [item, existing] = await Promise.all([
        tx.item.findUnique({ where: { id: itemId }, select: { id: true, isArchived: true, name: true } }),
        tx.inventoryInstance.findMany({ where: { itemId }, select: { id: true, itemId: true, updatedAt: true, status: true, inspectionExcluded: true, inspectionExclusionReason: true, lotNo: true, storageLocationId: true } }),
      ]);
      if (!item || item.isArchived) throw new Error("ITEM_NOT_ACTIVE");
      // The entire stock list must match the reviewed snapshot, not only selected rows.
      if (existing.length !== snapshots.length || existing.some(s => !snapshotIds.has(s.id))) throw new Error("STOCK_CHANGED");
      const expected = new Map(snapshots.map(s => [s.id, Date.parse(s.expectedUpdatedAt)]));
      if (existing.some(s => s.updatedAt.getTime() !== expected.get(s.id))) throw new Error("STOCK_CHANGED");
      const targetIds = new Set(targets.map(s => s.id));
      const affected = existing.filter(s => targetIds.has(s.id));
      if (affected.some(s => s.status === "廃止")) throw new Error("STOCK_DELETED");
      const now = new Date();
      for (const stock of affected) {
        const update = await tx.inventoryInstance.updateMany({
          where: { id: stock.id, itemId, updatedAt: stock.updatedAt, status: { not: "廃止" } },
          data: { inspectionExcluded: true, inspectionExclusionReason: reason },
        });
        if (update.count !== 1) throw new Error("STOCK_CHANGED");
      }
      const actorId = (auth.user!.baseRole ?? auth.user!.role) === "ADMIN" ? auth.user!.id : getAdminElevation(request)?.adminUserId;
      if (!actorId) throw new Error("ADMIN_REQUIRED");
      await tx.adminActionLog.create({ data: {
        adminUserId: actorId, action: "INVENTORY_BULK_EXCLUDE_INSPECTION", route: "/api/inventory/bulk",
        detail: JSON.parse(JSON.stringify({
          itemId, itemName: item.name, reason, scope, selectedIds, targetIds: [...targetIds],
          requestedBy: auth.user!.id, occurredAt: now.toISOString(),
          changes: affected.map(s => ({ id: s.id, lotNo: s.lotNo, storageLocationId: s.storageLocationId, before: { inspectionExcluded: s.inspectionExcluded, inspectionExclusionReason: s.inspectionExclusionReason }, after: { inspectionExcluded: true, inspectionExclusionReason: reason } })),
        })) as Prisma.InputJsonValue,
      } });
      return affected.length;
    }, { isolationLevel: "Serializable", timeout: 30000 });
    return NextResponse.json({ success: true, affectedCount: result, message: result + "件を棚卸対象から外しました。" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BULK_FAILED";
    if (code === "STOCK_CHANGED") return NextResponse.json({ code, message: "在庫明細が他の端末で更新されました。再読み込みして対象を確認してください。" }, { status: 409 });
    if (code === "STOCK_DELETED" || code === "ITEM_NOT_ACTIVE") return NextResponse.json({ code, message: "削除済みの商品・在庫が含まれています。再読み込みしてください。" }, { status: 409 });
    return NextResponse.json({ code: "BULK_FAILED", message: "一括操作を保存できませんでした。変更は確定していません。" }, { status: 409 });
  }
}
