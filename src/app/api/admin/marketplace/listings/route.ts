import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUSES = ["DRAFT", "READY", "LISTED", "SOLD", "CANCELLED"] as const;

function text(value: unknown, max = 200) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function positiveInt(value: unknown) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
function csvCell(value: unknown) { const content = String(value ?? ""); return `"${content.replace(/"/g, '""')}"`; }

export async function GET(request: NextRequest) {
  const auth = requireLogin(request); if (auth.response) return auth.response;
  const [listings, inventories, channels, shippingRates, recommendationSetting] = await Promise.all([
    prisma.marketplaceListing.findMany({ orderBy: { updatedAt: "desc" }, include: { inventoryInstance: { include: { item: true, storageLocation: true } } } }),
    prisma.inventoryInstance.findMany({ where: { quantity: { gt: 0 }, status: { not: "廃止" } }, orderBy: { updatedAt: "desc" }, include: { item: true, storageLocation: true }, take: 500 }),
    prisma.salesChannelSetting.findMany({ where: { isEnabled: true }, orderBy: { displayName: "asc" } }),
    prisma.shippingRate.findMany({ where: { isActive: true, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] }, orderBy: { fee: "asc" } }),
    prisma.salesRecommendationSetting.findUnique({ where: { id: "system" } }),
  ]);
  if (request.nextUrl.searchParams.get("format") === "csv") {
    const rows = [["状態","チャネル","外部出品ID","商品名","価格","出品数","販売数","手数料","送料","現在庫","更新日時"], ...listings.map((entry) => [entry.status, entry.channel, entry.externalListingId, entry.title, entry.price, entry.listedQuantity, entry.soldQuantity, entry.fee, entry.shippingCost, entry.inventoryInstance.quantity, entry.updatedAt.toISOString()])];
    return new NextResponse(`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="marketplace-listings-${new Date().toISOString().slice(0,10)}.csv"` } });
  }
  const reserved = new Map<string, number>();
  for (const entry of listings) if (["DRAFT","READY","LISTED"].includes(entry.status)) reserved.set(entry.inventoryInstanceId, (reserved.get(entry.inventoryInstanceId) ?? 0) + entry.listedQuantity);
  return NextResponse.json({ listings, inventories: inventories.map((entry) => ({ ...entry, fleaMarketReserved: reserved.get(entry.id) ?? 0, storageAvailable: Math.max(entry.quantity - (reserved.get(entry.id) ?? 0), 0) })), channels, shippingRates, recommendationSetting });
}

export async function POST(request: NextRequest) {
  const auth = requireLogin(request); if (auth.response || !auth.user) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const inventoryInstanceId = text(body?.inventoryInstanceId, 100); const price = positiveInt(body?.price); const listedQuantity = positiveInt(body?.listedQuantity);
  if (!inventoryInstanceId || !price || !listedQuantity) return NextResponse.json({ code: "MARKETPLACE_INPUT_INVALID", message: "商品、価格、出品数を正しく入力してください。" }, { status: 400 });
  const inventory = await prisma.inventoryInstance.findUnique({ where: { id: inventoryInstanceId }, include: { item: true } });
  const reserved = await prisma.marketplaceListing.aggregate({ where: { inventoryInstanceId, status: { in: ["DRAFT","READY","LISTED"] } }, _sum: { listedQuantity: true } });
  const available = (inventory?.quantity ?? 0) - (reserved._sum.listedQuantity ?? 0);
  if (!inventory || available < listedQuantity) return NextResponse.json({ code: "MARKETPLACE_STOCK_SHORTAGE", message: `保管利用可能数は${Math.max(available,0)}点です。既存のフリマ引当を確認してください。` }, { status: 409 });
  const listing = await prisma.$transaction(async (tx) => {
    const created = await tx.marketplaceListing.create({ data: { inventoryInstanceId, channel: text(body?.channel, 50) || "flea_market", externalListingId: text(body?.externalListingId, 100) || null, title: text(body?.title, 200) || inventory.item.name, price, listedQuantity, fee: positiveInt(body?.fee), shippingCost: positiveInt(body?.shippingCost), packagingCost: positiveInt(body?.packagingCost) ?? 0, acquisitionCostSnapshot: inventory.acquisitionCost, shippingMethod: text(body?.shippingMethod, 100) || null, notes: text(body?.notes, 1000) || null, status: "DRAFT", createdByUserId: auth.user!.id } });
    await tx.inventoryInstance.update({ where: { id: inventoryInstanceId }, data: { allocationType: "flea_market" } });
    await tx.adminActionLog.create({ data: { adminUserId: auth.user!.id, action: "MARKETPLACE_LISTING_CREATE", route: "/admin/marketplace", detail: { listingId: created.id, itemName: inventory.item.name, price, listedQuantity } } });
    return created;
  });
  return NextResponse.json({ listing, message: "出品候補へ追加しました。" }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = requireLogin(request); if (auth.response || !auth.user) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = text(body?.id, 100); const status = text(body?.status, 20);
  if (!id || !STATUSES.includes(status as typeof STATUSES[number])) return NextResponse.json({ code: "MARKETPLACE_STATUS_INVALID", message: "更新内容が正しくありません。" }, { status: 400 });
  const existing = await prisma.marketplaceListing.findUnique({ where: { id }, include: { inventoryInstance: { include: { item: true } } } });
  if (!existing) return NextResponse.json({ code: "MARKETPLACE_NOT_FOUND", message: "対象の出品が見つかりません。" }, { status: 404 });
  if (existing.status === "SOLD" || existing.status === "CANCELLED") return NextResponse.json({ code: "MARKETPLACE_ALREADY_CLOSED", message: "終了済みの出品は変更できません。" }, { status: 409 });

  const result = await prisma.$transaction(async (tx) => {
    if (status === "SOLD") {
      const soldQuantity = positiveInt(body?.soldQuantity) ?? existing.listedQuantity;
      if (soldQuantity > existing.inventoryInstance.quantity) throw new Error("MARKETPLACE_STOCK_SHORTAGE");
      const before = existing.inventoryInstance.quantity; const after = before - soldQuantity;
      await tx.inventoryInstance.update({ where: { id: existing.inventoryInstanceId }, data: { quantity: after, actualQuantity: existing.inventoryInstance.actualQuantity === null ? null : Math.max(existing.inventoryInstance.actualQuantity - soldQuantity, 0) } });
      await tx.inventoryHistory.create({ data: { inventoryInstanceId: existing.inventoryInstanceId, changeQuantity: -soldQuantity, action: "フリマ販売" } });
      await tx.inventoryEvent.create({ data: { inventoryInstanceId: existing.inventoryInstanceId, eventType: "ISSUE", quantityBefore: before, quantityChange: -soldQuantity, quantityAfter: after, reason: "フリマ販売", detail: { marketplaceListingId: id, channel: existing.channel, externalListingId: existing.externalListingId }, performedByUserId: auth.user!.id } });
      await tx.notification.create({ data: { type: "MARKETPLACE_SOLD", audience: "ADMIN", title: "フリマ販売を在庫へ反映", message: `${existing.inventoryInstance.item.name}を${soldQuantity}点販売し、残数は${after}点です。`, detail: { marketplaceListingId: id } } });
      return tx.marketplaceListing.update({ where: { id }, data: { status: "SOLD", soldQuantity, soldAt: new Date() } });
    }
    const updated = await tx.marketplaceListing.update({ where: { id }, data: { status: status as typeof STATUSES[number], listedAt: status === "LISTED" ? new Date() : existing.listedAt, externalListingId: text(body?.externalListingId, 100) || existing.externalListingId } });
    if (status === "CANCELLED") {
      const active = await tx.marketplaceListing.count({ where: { inventoryInstanceId: existing.inventoryInstanceId, id: { not: id }, status: { in: ["DRAFT", "READY", "LISTED"] } } });
      if (active === 0) await tx.inventoryInstance.update({ where: { id: existing.inventoryInstanceId }, data: { allocationType: "home" } });
    }
    return updated;
  }).catch((error) => { if (error instanceof Error && error.message === "MARKETPLACE_STOCK_SHORTAGE") return null; throw error; });
  if (!result) return NextResponse.json({ code: "MARKETPLACE_STOCK_SHORTAGE", message: "販売数が現在庫を超えています。最新の在庫を確認してください。" }, { status: 409 });
  await prisma.adminActionLog.create({ data: { adminUserId: auth.user.id, action: status === "SOLD" ? "MARKETPLACE_SALE_APPLY" : "MARKETPLACE_LISTING_STATUS_UPDATE", route: "/admin/marketplace", detail: { listingId: id, status } } });
  return NextResponse.json({ listing: result, message: status === "SOLD" ? "売却を在庫へ反映しました。" : "出品状態を更新しました。" });
}
