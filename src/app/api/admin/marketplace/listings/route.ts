import {availableStock,RESERVED_LISTING_STATUSES} from "@/lib/stock-state";
import { scheduleDeviceNotifications } from "@/lib/device-push";
import { reverseMarketplace } from "@/lib/marketplace-reversal";
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

  const query = (request.nextUrl.searchParams.get("inventoryQuery") ?? "").normalize("NFKC").trim().slice(0,200);
  const category = request.nextUrl.searchParams.get("category");
  const location = request.nextUrl.searchParams.get("location");
  const [listings, inventories, channels, shippingRates, recommendationSetting] = await prisma.$transaction(tx=>Promise.all([
    tx.marketplaceListing.findMany({
      orderBy: { updatedAt: "desc" },
      include: { inventoryInstance: { include: { item: true, storageLocation: true } } },
    }),
    tx.inventoryInstance.findMany({
      where: { quantity: { gt: 0 }, status: { not: "廃止" }, item: { isArchived:false, ...(category ? {majorCategory:category}: {}) }, ...(location ? {storageLocation:{name:location}}:{}), ...(query ? {OR:[{item:{name:{contains:query,mode:"insensitive" as const}}},{item:{janCode:{contains:query}}},{item:{systemBarcode:{contains:query,mode:"insensitive" as const}}},{item:{managementCode:{contains:query,mode:"insensitive" as const}}},{lotNo:{contains:query,mode:"insensitive" as const}},{storageLocation:{name:{contains:query,mode:"insensitive" as const}}}]}:{}) },
      orderBy: { updatedAt: "desc" },
      include: { item: true, storageLocation: true },
      take: 500,
    }),
    tx.salesChannelSetting.findMany({ where: { isEnabled: true }, orderBy: { displayName: "asc" } }),
    tx.shippingRate.findMany({
      where: { isActive: true, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
      orderBy: { fee: "asc" },
    }),
    tx.salesRecommendationSetting.findUnique({ where: { id: "system" } }),
  ]),{isolationLevel:"RepeatableRead"});

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
    if ((RESERVED_LISTING_STATUSES as readonly string[]).includes(entry.status)) {
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
    inventories: inventories.map((entry) => ({ ...entry, fleaMarketReserved: reserved.get(entry.id) ?? 0, storageAvailable: availableStock(entry.quantity,reserved.get(entry.id)??0) })),
    channels,
    shippingRates,
    recommendationSetting,
    summary,
  });
}

export async function GET(request: NextRequest) {
  scheduleDeviceNotifications(false);
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

async function createListing(request: NextRequest) {
  const auth = requireLogin(request);
  if (auth.response || !auth.user) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const inventoryInstanceId = text(body?.inventoryInstanceId, 100);
  const price = positiveInt(body?.price);
  const listedQuantity = positiveInt(body?.listedQuantity);
  if (!inventoryInstanceId || !price || !listedQuantity) {
    return NextResponse.json({ code: "MARKETPLACE_INPUT_INVALID", message: "商品、価格、出品数を正しく入力してください。" }, { status: 400 });
  }

  const listing = await prisma.$transaction(async (tx) => {
    const inventory = await tx.inventoryInstance.findUnique({ where: { id: inventoryInstanceId }, include: { item: true } });
    const reserved = await tx.marketplaceListing.aggregate({ where: { inventoryInstanceId, status: { in: [...RESERVED_LISTING_STATUSES] } }, _sum: { listedQuantity: true } });
    if (!inventory || inventory.item.isArchived || inventory.status === "廃止" || inventory.quantity - (reserved._sum.listedQuantity ?? 0) < listedQuantity) throw new Error("MARKETPLACE_STOCK_SHORTAGE");
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
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return NextResponse.json({ listing, message: "出品準備へ追加しました。" }, { status: 201 });
}

async function changeListing(request: NextRequest) {
  const auth = requireLogin(request);
  if (auth.response || !auth.user) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = text(body?.id, 100);
  const action = text(body?.action, 40);
  if (action === "ADMIN_REVERSE" && body) return reverseMarketplace(request, body);
  if (!id) return NextResponse.json({ code: "MARKETPLACE_ID_REQUIRED", message: "対象の出品を指定してください。" }, { status: 400 });

  const existing = await prisma.marketplaceListing.findUnique({ where: { id }, include: { inventoryInstance: { include: { item: true } } } });
  if (!existing) return NextResponse.json({ code: "MARKETPLACE_NOT_FOUND", message: "対象の出品が見つかりません。" }, { status: 404 });

  if (body?.expectedUpdatedAt && body.expectedUpdatedAt !== existing.updatedAt.toISOString()) throw new Error("MARKETPLACE_CHANGED");
  if (action === "UPDATE_DETAILS") {
    const listing = await prisma.marketplaceListing.update({
      where: { id, updatedAt: existing.updatedAt },
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
    if (existing.status !== "SOLD") return NextResponse.json({ code: "MARKETPLACE_NOT_SOLD", message: "売却を確定してから発送状態を変更してください。" }, { status: 409 });
    const shippingStatus = text(body?.shippingStatus, 30);
    if (!SHIPPING_STATUSES.includes(shippingStatus as typeof SHIPPING_STATUSES[number])) {
      return NextResponse.json({ code: "MARKETPLACE_SHIPPING_STATUS_INVALID", message: "発送状態が正しくありません。" }, { status: 400 });
    }
    const nextShipping = ({NOT_READY:"PACKING",PACKING:"READY_TO_SHIP",READY_TO_SHIP:"SHIPPED",SHIPPED:"DELIVERED",DELIVERED:"SETTLED"} as Record<string,string>)[existing.shippingStatus];
    if (shippingStatus !== nextShipping) return NextResponse.json({message:"発送状態は順に進めてください。取消・差戻しは管理者操作から行えます。"},{status:409});
    const now = new Date();
    const listing = await prisma.marketplaceListing.update({
      where: { id, updatedAt: existing.updatedAt },
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
  if (status !== "CANCELLED" && ({DRAFT:"READY",READY:"LISTED",LISTED:"SOLD"} as Record<string,string>)[existing.status] !== status) return NextResponse.json({message:"順番に状態を進めてください。差戻しは管理者モードから行えます。"},{status:409});
  if (["SOLD", "CANCELLED"].includes(existing.status)) {
    return NextResponse.json({ code: "MARKETPLACE_ALREADY_CLOSED", message: "終了済みの出品は変更できません。" }, { status: 409 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.marketplaceListing.updateMany({ where: { id, status: existing.status, updatedAt: existing.updatedAt }, data: { updatedAt: new Date() } });
    if (claimed.count !== 1) throw new Error("MARKETPLACE_CHANGED");
    await tx.adminActionLog.create({ data: { adminUserId: auth.user.id, action: status === "SOLD" ? "PERSONAL_MARKETPLACE_SALE_APPLY" : "PERSONAL_MARKETPLACE_STATUS_UPDATE", route: "/marketplace", detail: { listingId: id, status } } });
    if (status === "SOLD") {
      const soldQuantity = positiveInt(body?.soldQuantity) ?? existing.listedQuantity;
      if (soldQuantity > existing.listedQuantity || soldQuantity > existing.inventoryInstance.quantity) throw new Error("MARKETPLACE_STOCK_SHORTAGE");
      const before = existing.inventoryInstance.quantity;
      const after = before - soldQuantity;
      const changed = await tx.inventoryInstance.updateMany({ where: { id: existing.inventoryInstanceId, quantity: before, updatedAt: existing.inventoryInstance.updatedAt }, data: { quantity: after, actualQuantity: existing.inventoryInstance.actualQuantity === null ? null : Math.max(existing.inventoryInstance.actualQuantity - soldQuantity, 0) } });
      if (changed.count !== 1) throw new Error("MARKETPLACE_CHANGED");
      await tx.inventoryHistory.create({ data: { inventoryInstanceId: existing.inventoryInstanceId, changeQuantity: -soldQuantity, action: `個人フリマ販売：${existing.channel}` } });
      await tx.inventoryEvent.create({ data: { inventoryInstanceId: existing.inventoryInstanceId, eventType: "ISSUE", quantityBefore: before, quantityChange: -soldQuantity, quantityAfter: after, reason: "個人フリマ販売", detail: { marketplaceListingId: id, channel: existing.channel, externalListingId: existing.externalListingId }, performedByUserId: auth.user.id } });
      const siblingResult = await tx.marketplaceListing.updateMany({ where: { inventoryInstanceId: existing.inventoryInstanceId, id: { not: id }, status: { in: [...RESERVED_LISTING_STATUSES] } }, data: { status: "CANCELLED", notes: "他の販売先で売却されたため取り下げ確認が必要です。" } });
      await tx.notification.create({ data: { type: "MARKETPLACE_SOLD", audience: "ADMIN", title: siblingResult.count ? "売却済み：他サイトの出品を取り下げてください" : "フリマ販売を在庫へ反映", message: `${existing.inventoryInstance.item.name}を${soldQuantity}点販売し、残数は${after}点です。${siblingResult.count ? ` 併売${siblingResult.count}件を停止扱いにしました。` : ""}`, detail: { marketplaceListingId: id, cancelledSiblingCount: siblingResult.count } } });
      return tx.marketplaceListing.update({ where: { id }, data: { status: "SOLD", soldQuantity, soldAt: new Date(), shippingStatus: "PACKING", fee: nonNegativeInt(body?.fee) ?? existing.fee, shippingCost: nonNegativeInt(body?.shippingCost) ?? existing.shippingCost } });
    }
    const updated = await tx.marketplaceListing.update({ where: { id }, data: { status: status as typeof LISTING_STATUSES[number], listedAt: status === "LISTED" ? new Date() : existing.listedAt, listingUrl: text(body?.listingUrl, 1000) || existing.listingUrl, externalListingId: text(body?.externalListingId, 100) || existing.externalListingId } });
    if (status === "CANCELLED") {
      const active = await tx.marketplaceListing.count({ where: { inventoryInstanceId: existing.inventoryInstanceId, id: { not: id }, status: { in: [...RESERVED_LISTING_STATUSES] } } });
      if (active === 0) await tx.inventoryInstance.update({ where: { id: existing.inventoryInstanceId }, data: { allocationType: "home" }, select: { id: true } });
    }
    return updated;
  }).catch((error) => error instanceof Error && error.message === "MARKETPLACE_STOCK_SHORTAGE" ? null : Promise.reject(error));

  if (!result) return NextResponse.json({ code: "MARKETPLACE_STOCK_SHORTAGE", message: "販売数が現在庫を超えています。最新の在庫を確認してください。" }, { status: 409 });
  return NextResponse.json({ listing: result, message: status === "SOLD" ? "売却を在庫へ反映し、併売中の出品を停止扱いにしました。" : "出品状態を更新しました。" });
}

function mutationError(error: unknown) {
  const conflict = error instanceof Error && /MARKETPLACE_(?:CHANGED|STOCK_SHORTAGE)/.test(error.message)
    || error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2025"].includes(error.code);
  console.error("MARKETPLACE_MUTATION_FAILED", error);
  return NextResponse.json({ code: conflict ? "MARKETPLACE_CONFLICT" : "MARKETPLACE_UPDATE_FAILED", message: conflict ? "在庫または出品状態が変わりました。最新の内容を確認してから再操作してください。" : "出品情報を更新できませんでした。再読み込みして状態を確認してください。" }, { status: conflict ? 409 : 500 });
}
export async function POST(request: NextRequest) {
  scheduleDeviceNotifications(true); try { return await createListing(request); } catch (error) { return mutationError(error); } }
export async function PATCH(request: NextRequest) {
  scheduleDeviceNotifications(true); try { return await changeListing(request); } catch (error) { return mutationError(error); } }
