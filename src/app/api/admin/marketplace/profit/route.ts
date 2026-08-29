import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = requireLogin(request); if (auth.response) return auth.response;
  const body = await request.json().catch(() => null) as { inventoryInstanceId?: unknown; channel?: unknown; price?: unknown; packagingCost?: unknown } | null;
  const inventoryInstanceId = typeof body?.inventoryInstanceId === "string" ? body.inventoryInstanceId : ""; const channel = typeof body?.channel === "string" ? body.channel : "flea_market"; const price = Math.round(Number(body?.price));
  if (!inventoryInstanceId || !Number.isFinite(price) || price <= 0) return NextResponse.json({ message: "商品と販売価格を指定してください。" }, { status: 400 });
  const [inventory, channelSetting, shippingRates, recommendationSetting] = await Promise.all([
    prisma.inventoryInstance.findUnique({ where: { id: inventoryInstanceId }, include: { item: true } }),
    prisma.salesChannelSetting.findUnique({ where: { channel } }),
    prisma.shippingRate.findMany({ where: { isActive: true, channel: { in: [channel,"all"] }, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] }, orderBy: { fee: "asc" } }),
    prisma.salesRecommendationSetting.findUnique({ where: { id: "system" } }),
  ]);
  if (!inventory) return NextResponse.json({ message: "商品が見つかりません。" }, { status: 404 });
  const totalDimensions = (inventory.packageLengthCm ?? 0) + (inventory.packageWidthCm ?? 0) + (inventory.packageHeightCm ?? 0);
  const eligible = shippingRates.filter((rate) => (!rate.maxWeightGrams || !inventory.packageWeightGrams || inventory.packageWeightGrams <= rate.maxWeightGrams) && (!rate.maxTotalDimensionsCm || totalDimensions === 0 || totalDimensions <= rate.maxTotalDimensionsCm) && (!rate.maxLengthCm || !inventory.packageLengthCm || inventory.packageLengthCm <= rate.maxLengthCm) && (!rate.maxWidthCm || !inventory.packageWidthCm || inventory.packageWidthCm <= rate.maxWidthCm) && (!rate.maxHeightCm || !inventory.packageHeightCm || inventory.packageHeightCm <= rate.maxHeightCm));
  const feeConfigured = Boolean(channelSetting && channelSetting.feeRateBps > 0);
  const feeRateBps = channelSetting?.feeRateBps ?? 0; const platformFee = Math.ceil(price * feeRateBps / 10_000); const acquisitionCost = inventory.acquisitionCost ?? 0; const packagingCost = Number.isFinite(Number(body?.packagingCost)) ? Math.max(Math.round(Number(body?.packagingCost)),0) : recommendationSetting?.packagingCostDefault ?? 100; const targetRate = recommendationSetting?.targetProfitRateBps ?? 2000;
  const methods = eligible.map((rate) => { const profit = price - platformFee - rate.fee - packagingCost - acquisitionCost; const profitRate = Math.round(profit / price * 10_000); const denominator = Math.max(1, 10_000 - feeRateBps - targetRate); const recommendedMinimumPrice = Math.ceil((acquisitionCost + packagingCost + rate.fee) * 10_000 / denominator); return { ...rate, platformFee, acquisitionCost, packagingCost, profit, profitRateBps: profitRate, recommendedMinimumPrice }; }).sort((a,b) => b.profit - a.profit);
  const shippingConfigured = shippingRates.length > 0;
  return NextResponse.json({ itemName: inventory.item.name, price, feeRateBps, feeConfigured, shippingConfigured, shippingMatched: eligible.length > 0, dimensionsComplete: Boolean(inventory.packageWeightGrams && inventory.packageLengthCm && inventory.packageWidthCm && inventory.packageHeightCm), methods, recommendation: methods[0] ?? null });
}
