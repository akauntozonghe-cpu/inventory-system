import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const labels = { ARCHIVE: "廃止", RESTORE: "復帰", EXCLUDE_INSPECTION: "点検対象外", INCLUDE_INSPECTION: "点検対象" } as const;
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;
  const body = await request.json().catch(() => null);
  const action = body?.operation as keyof typeof labels;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const expected = typeof body?.expectedUpdatedAt === "string" ? new Date(body.expectedUpdatedAt) : null;
  if (!Object.hasOwn(labels, action) || reason.length < 2 || reason.length > 500 || !expected || !Number.isFinite(expected.getTime())) {
    return NextResponse.json({ message: "操作・変更理由・最新の在庫明細を確認してください。" }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    await prisma.$transaction(async tx => {
      const stock = await tx.inventoryInstance.findUnique({ where: { id }, include: { item: true } });
      if (!stock || stock.updatedAt.getTime() !== expected.getTime()) throw new Error("STOCK_CHANGED");
      if (action === "RESTORE" && stock.item.isArchived) throw new Error("GROUP_ARCHIVED");
      if (action === "ARCHIVE" && stock.status !== "廃止") {
        const [targets, listings] = await Promise.all([
          tx.stocktakeTarget.count({ where: { inventoryInstanceId: id, session: { status: { in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"] } } } }),
          tx.marketplaceListing.count({ where: { inventoryInstanceId: id, status: { in: ["DRAFT", "READY", "LISTED"] } } }),
        ]);
        if (targets || listings) throw new Error("STOCK_ACTIVE_WORK");
      }
      const changes = action === "ARCHIVE"
        ? { status: "廃止", archivedFromStatus: stock.status === "廃止" ? stock.archivedFromStatus : stock.status, archivedAt: stock.archivedAt ?? new Date(), archiveReason: reason }
        : action === "RESTORE"
          ? { status: stock.status === "廃止" ? stock.archivedFromStatus ?? "在庫中" : stock.status, archivedFromStatus: null, archivedAt: null, archiveReason: null }
          : { inspectionExcluded: action === "EXCLUDE_INSPECTION", inspectionExclusionReason: action === "EXCLUDE_INSPECTION" ? reason : null };
      const changed = await tx.inventoryInstance.updateMany({ where: { id, updatedAt: expected }, data: changes });
      if (changed.count !== 1) throw new Error("STOCK_CHANGED");
      await tx.adminActionLog.create({ data: {
        adminUserId: auth.user!.id, action: `INVENTORY_${action}`, route: `/api/inventory/${id}/lifecycle`,
        detail: JSON.parse(JSON.stringify({ reason, inventoryInstanceId: id, itemId: stock.itemId, itemName: stock.item.name,
          lotNo: stock.lotNo, expirationDate: stock.expirationDate, majorCategory: stock.majorCategory, minorCategory: stock.minorCategory, storageLocationId: stock.storageLocationId,
          before: { status: stock.status, inspectionExcluded: stock.inspectionExcluded, inspectionExclusionReason: stock.inspectionExclusionReason }, after: changes,
        })) as Prisma.InputJsonValue,
      } });
    }, { isolationLevel: "Serializable", timeout: 30000 });
    return NextResponse.json({ message: `この在庫明細だけを${labels[action]}にしました。同じJANの他の明細は変更していません。` });
  } catch (error) {
    const code = error instanceof Error ? error.message : "STOCK_FAILED";
    const messages: Record<string, string> = {
      STOCK_CHANGED: "在庫が更新されました。画面を更新して対象を確認してください。",
      GROUP_ARCHIVED: "商品グループ全体が廃止されています。先にグループを復帰してください。個別に廃止した他の明細は復帰しません。",
      STOCK_ACTIVE_WORK: "この在庫に進行中の棚卸または出品があります。完了・取消し後に廃止してください。",
    };
    return NextResponse.json({ message: messages[code] ?? "変更を保存できませんでした。最新の状態を確認してください。" }, { status: 409 });
  }
}
