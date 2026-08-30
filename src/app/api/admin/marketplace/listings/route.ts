import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireLogin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateMarketplaceProfit } from "@/lib/personal-marketplace";

const LISTING_STATUSES = ["DRAFT", "READY", "LISTED", "SOLD", "CANCELLED"] as const;
const SHIPPING_STATUSES = ["NOT_READY", "PACKING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "SETTLED"] as const;

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function positiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInt(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean).slice(0, 10)
    : [];
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function loadMarketplace(request: NextRequest) {
  const auth = requireLogin(request);
  if (auth.response) return auth.response;

  const [listings, inventories, channels, shippingRates, recommendationSetting] = await Promise.all([
    prisma.marketplaceListing.findMany({
      orderBy: { updatedAt: "desc" },
      include: { inventoryInstance: { include: { item: true, storageLocation: true } } },
    }),
    prisma.inventoryInstance.findMany({
      where: { quantity: { gt: 0 }, status: { not: "廃止" } },
      orderBy: { updatedAt: "desc" },
      include: { item: true, storageLocation: true },
      take: 500,
    }),
    prisma.salesChannelSetting.findMany({ where: { isEnabled: true }, orderBy: { displayName: "asc" } }),
    prisma.shippingRate.findMany({
      where: { isActive: true, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
      orderBy: { fee: "asc" },
    }),
    prisma.salesRecommendationSetting.findUnique({ where: { id: "system" } }),
  ]);

  if (request.nextUrl.searchParams.get("format") === "csv") {
    const rows = [
      ["状態", "発送", "販売先", "商品名", "価格", "出品数", "販売数", "手数料", "送料", "利益", "出品URL", "追跡番号", "更新日時"],
      ...listings.map((entry) => {
        const profit = entry.status === "SOLD"
          ? calculateMarketplaceProfit({ price: entry.price, quantity: entry.soldQuantity, fee: entry.fee ?? 0, shippingCost: entry.shippingCost ?? 0, packagingCost: entry.packagingCost ?? 0, acquisitionCostPerItem: entry.acquisitionCostSnapshot ?? 0 }).profit
          : "";
        return [entry.status, entry.shippingStatus, entry.channel, entry.title, entry.price, entry.listedQuantity, entry.soldQuantity, entry.fee, entry.shippingCost, profit, entry.listingUrl, entry.trackingNumber, entry.updatedAt.toISOString()];
      }),
    ];
    return new NextResponse(`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="personal-marketplace-${new Date().toISOString().slice(0, 10)}.csv"` },
    });
  }

  const reserved = new Map<string, number>();
  for (const entry of listings) {
    if (["DRAFT", "READY", "LISTED"].includes(entry.status)) {
      reserved.set(entry.inventoryInstanceId, (reserved.get(entry.inventoryInstanceId) ?? 0) + entry.listedQuantity);
    }
  }

  const summary = {
    preparing: listings.filter((entry) => entry.status === "DRAFT" || entry.status === "READY").length,
    listed: listings.filter((entry) => entry.status === "LISTED").length,
    shipping: listings.filter((entry) => entry.status === "SOLD" && !["DELIVERED", "SETTLED"].includes(entry.shippingStatus)).length,
    settledProfit: listings.filter((entry) => entry.shippingStatus === "SETTLED").reduce((sum, entry) => sum + calculateMarketplaceProfit({ price: entry.price, quantity: entry.soldQuantity, fee: entry.fee ?? 0, shippingCost: entry.shippingCost ?? 0, packagingCost: entry.packagingCost ?? 0, acquisitionCostPerItem: entry.acquisitionCostSnapshot ?? 0 }).profit, 0),
  };

  return NextResponse.json({
    listings,
    inventories: inventories.map((entry) => ({ ...entry, fleaMarketReserved: reserved.get(entry.id) ?? 0, storageAvailable: Math.max(entry.quantity - (reserved.get(entry.id) ?? 0), 0) })),
    channels,
    shippingRates,
    recommendationSetting,
    summary,
  });
}

export async function GET(request: NextRequest) {
  try {
    return await loadMarketplace(request);
  } catch (error) {
    console.error("GET /api/admin/marketplace/listings", error);

    const schemaNotReady =
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2021" || error.code === "P2022")) ||
      (error instanceof Error &&
        /does not exist|unknown column|missing.*column/i.test(error.message));

    return NextResponse.json(
      {
        code: schemaNotReady
          ? "MARKETPLACE_SCHEMA_NOT_READY"
          : "MARKETPLACE_LIST_FAILED",
        message: schemaNotReady
          ? "フリマ用データを更新しています。デプロイ完了後に再読み込みしてください。"
          : "フリマ情報を取得できませんでした。しばらく待ってから再読み込みしてください。",
      },
      { status: schemaNotReady ? 503 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = requireLogin(request);
  if (auth.response || !auth.user) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const inventoryInstanceId = text(body?.inventoryInstanceId, 100);
  const price = positiveInt(body?.price);
  const listedQuantity = positiveInt(body?.listedQuantity);
  if (!inventoryInstanceId || !price || !listedQuantity) {
    return NextResponse.json({ code: "MARKETPLACE_INPUT_INVALID", message: "商品、価格、出品数を正しく入力してください。" }, { status: 400 });
  }

  const inventory = await prisma.inventoryInstance.findUnique({ where: { id: inventoryInstanceId }, include: { item: true } });
  const reserved = await prisma.marketplaceListing.aggregate({ where: { inventoryInstanceId, status: { in: ["DRAFT", "READY", "LISTED"] } }, _sum: { listedQuantity: true } });
  const available = (inventory?.quantity ?? 0) - (reserved._sum.listedQuantity ?? 0);
  if (!inventory || available < listedQuantity) {
    return NextResponse.json({ code: "MARKETPLACE_STOCK_SHORTAGE", message: `保管利用可能数は${Math.max(available, 0)}点です。既存の併売引当を確認してください。` }, { status: 409 });
  }

  const listing = await prisma.$transaction(async (tx) => {
    const created = await tx.marketplaceListing.create({
      data: {
        inventoryInstanceId,
        channel: text(body?.channel, 50) || "mercari",
        title: text(body?.title, 200) || inventory.item.name,
        description: text(body?.description, 4000) || null,
        category: text(body?.category, 100) || inventory.item.majorCategory,
        itemCondition: text(body?.itemCondition, 100) || null,
        photoUrls: stringList(body?.photoUrls),
        listingUrl: text(body?.listingUrl, 1000) || null,
        price,
        listedQuantity,
        fee: nonNegativeInt(body?.fee),
        shippingCost: nonNegativeInt(body?.shippingCost),
        packagingCost: nonNegativeInt(body?.packagingCost) ?? 0,
        acquisitionCostSnapshot: inventory.acquisitionCost,
        shippingMethod: text(body?.shippingMethod, 100) || null,
        notes: text(body?.notes, 1000) || null,
        status: "DRAFT",
        createdByUserId: auth.user.id,
      },
    });
    await tx.inventoryInstance.update({ where: { id: inventoryInstanceId }, data: { allocationType: "flea_market" }, select: { id: true } });
    await tx.adminActionLog.create({ data: { adminUserId: auth.user.id, action: "PERSONAL_MARKETPLACE_DRAFT_CREATE", route: "/marketplace", detail: { listingId: created.id, itemName: inventory.item.name, channel: created.channel } } });
    return created;
  });
  return NextResponse.json({ listing, message: "出品準備へ追加しました。" }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = requireLogin(request);
  if (auth.response || !auth.user) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = text(body?.id, 100);
  const action = text(body?.action, 40);
  if (!id) return NextResponse.json({ code: "MARKETPLACE_ID_REQUIRED", message: "対象の出品を指定してください。" }, { status: 400 });

  const existing = await prisma.marketplaceListing.findUnique({ where: { id }, include: { inventoryInstance: { include: { item: true } } } });
  if (!existing) return NextResponse.json({ code: "MARKETPLACE_NOT_FOUND", message: "対象の出品が見つかりません。" }, { status: 404 });

  if (action === "UPDATE_DETAILS") {
    const listing = await prisma.marketplaceListing.update({
      where: { id },
      data: {
        title: text(body?.title, 200) || existing.title,
        description: text(body?.description, 4000) || null,
        category: text(body?.category, 100) || null,
        itemCondition: text(body?.itemCondition, 100) || null,
        listingUrl: text(body?.listingUrl, 1000) || null,
        photoUrls: stringList(body?.photoUrls),
        price: positiveInt(body?.price) ?? existing.price,
        shippingMethod: text(body?.shippingMethod, 100) || null,
        notes: text(body?.notes, 1000) || null,
      },
    });
    return NextResponse.json({ listing, message: "出品情報を保存しました。" });
  }

  if (action === "UPDATE_SHIPPING") {
    const shippingStatus = text(body?.shippingStatus, 30);
    if (!SHIPPING_STATUSES.includes(shippingStatus as typeof SHIPPING_STATUSES[number])) {
      return NextResponse.json({ code: "MARKETPLACE_SHIPPING_STATUS_INVALID", message: "発送状態が正しくありません。" }, { status: 400 });
    }
    const now = new Date();
    const listing = await prisma.marketplaceListing.update({
      where: { id },
      data: {
        shippingStatus,
        trackingNumber: text(body?.trackingNumber, 100) || existing.trackingNumber,
        shippingMethod: text(body?.shippingMethod, 100) || existing.shippingMethod,
        shippingCost: nonNegativeInt(body?.shippingCost) ?? existing.shippingCost,
        shippedAt: shippingStatus === "SHIPPED" ? now : existing.shippedAt,
        deliveredAt: shippingStatus === "DELIVERED" ? now : existing.deliveredAt,
        settledAt: shippingStatus === "SETTLED" ? now : existing.settledAt,
      },
    });
    return NextResponse.json({ listing, message: "発送・取引状態を更新しました。" });
  }

  const status = text(body?.status, 20);
  if (!LISTING_STATUSES.includes(status as typeof LISTING_STATUSES[number])) {
    return NextResponse.json({ code: "MARKETPLACE_STATUS_INVALID", message: "更新内容が正しくありません。" }, { status: 400 });
  }
  if (["SOLD", "CANCELLED"].includes(existing.status)) {
    return NextResponse.json({ code: "MARKETPLACE_ALREADY_CLOSED", message: "終了済みの出品は変更できません。" }, { status: 409 });
  }

  const result = await prisma.$transaction(async (tx) => {
    if (status === "SOLD") {
      const soldQuantity = positiveInt(body?.soldQuantity) ?? existing.listedQuantity;
      if (soldQuantity > existing.inventoryInstance.quantity) throw new Error("MARKETPLACE_STOCK_SHORTAGE");
      const before = existing.inventoryInstance.quantity;
      const after = before - soldQuantity;
      await tx.inventoryInstance.update({ where: { id: existing.inventoryInstanceId }, data: { quantity: after, actualQuantity: existing.inventoryInstance.actualQuantity === null ? null : Math.max(existing.inventoryInstance.actualQuantity - soldQuantity, 0) }, select: { id: true } });
      await tx.inventoryHistory.create({ data: { inventoryInstanceId: existing.inventoryInstanceId, changeQuantity: -soldQuantity, action: `個人フリマ販売：${existing.channel}` } });
      await tx.inventoryEvent.create({ data: { inventoryInstanceId: existing.inventoryInstanceId, eventType: "ISSUE", quantityBefore: before, quantityChange: -soldQuantity, quantityAfter: after, reason: "個人フリマ販売", detail: { marketplaceListingId: id, channel: existing.channel, externalListingId: existing.externalListingId }, performedByUserId: auth.user.id } });
      const siblingResult = await tx.marketplaceListing.updateMany({ where: { inventoryInstanceId: existing.inventoryInstanceId, id: { not: id }, status: { in: ["DRAFT", "READY", "LISTED"] } }, data: { status: "CANCELLED", notes: "他の販売先で売却されたため取り下げ確認が必要です。" } });
      await tx.notification.create({ data: { type: "MARKETPLACE_SOLD", audience: "ADMIN", title: siblingResult.count ? "売却済み：他サイトの出品を取り下げてください" : "フリマ販売を在庫へ反映", message: `${existing.inventoryInstance.item.name}を${soldQuantity}点販売し、残数は${after}点です。${siblingResult.count ? ` 併売${siblingResult.count}件を停止扱いにしました。` : ""}`, detail: { marketplaceListingId: id, cancelledSiblingCount: siblingResult.count } } });
      return tx.marketplaceListing.update({ where: { id }, data: { status: "SOLD", soldQuantity, soldAt: new Date(), shippingStatus: "PACKING", fee: nonNegativeInt(body?.fee) ?? existing.fee, shippingCost: nonNegativeInt(body?.shippingCost) ?? existing.shippingCost } });
    }
    const updated = await tx.marketplaceListing.update({ where: { id }, data: { status: status as typeof LISTING_STATUSES[number], listedAt: status === "LISTED" ? new Date() : existing.listedAt, listingUrl: text(body?.listingUrl, 1000) || existing.listingUrl, externalListingId: text(body?.externalListingId, 100) || existing.externalListingId } });
    if (status === "CANCELLED") {
      const active = await tx.marketplaceListing.count({ where: { inventoryInstanceId: existing.inventoryInstanceId, id: { not: id }, status: { in: ["DRAFT", "READY", "LISTED"] } } });
      if (active === 0) await tx.inventoryInstance.update({ where: { id: existing.inventoryInstanceId }, data: { allocationType: "home" }, select: { id: true } });
    }
    return updated;
  }).catch((error) => error instanceof Error && error.message === "MARKETPLACE_STOCK_SHORTAGE" ? null : Promise.reject(error));

  if (!result) return NextResponse.json({ code: "MARKETPLACE_STOCK_SHORTAGE", message: "販売数が現在庫を超えています。最新の在庫を確認してください。" }, { status: 409 });
  await prisma.adminActionLog.create({ data: { adminUserId: auth.user.id, action: status === "SOLD" ? "PERSONAL_MARKETPLACE_SALE_APPLY" : "PERSONAL_MARKETPLACE_STATUS_UPDATE", route: "/marketplace", detail: { listingId: id, status } } });
  return NextResponse.json({ listing: result, message: status === "SOLD" ? "売却を在庫へ反映し、併売中の出品を停止扱いにしました。" : "出品状態を更新しました。" });
}
