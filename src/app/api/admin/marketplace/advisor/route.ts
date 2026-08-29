import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function numberValue(value: unknown, min = 0, max = 10_000_000) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= min && parsed <= max ? Math.round(parsed) : null; }
function stringValue(value: unknown, max = 200) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request); if (auth.response) return auth.response;
  const [setting, inventories, soldListings] = await Promise.all([
    prisma.salesRecommendationSetting.findUnique({ where: { id: "system" } }),
    prisma.inventoryInstance.findMany({ where: { quantity: { gt: 0 }, status: { not: "廃止" } }, include: { item: true, marketplaceListings: { where: { status: { in: ["DRAFT","READY","LISTED"] } }, select: { listedQuantity: true } } }, orderBy: { updatedAt: "asc" }, take: 500 }),
    prisma.marketplaceListing.findMany({ where: { status: "SOLD" }, select: { price: true, soldAt: true, inventoryInstance: { select: { item: { select: { majorCategory: true, name: true } } } } }, orderBy: { soldAt: "desc" }, take: 300 }),
  ]);
  const config = setting ?? { regionName: "東京都", latitude: 35.6762, longitude: 139.6503, packagingCostDefault: 100, targetProfitRateBps: 2000 };
  let weather: { maxTemperature: number | null; minTemperature: number | null; precipitation: number | null; summary: string } = { maxTemperature: null, minTemperature: null, precipitation: null, summary: "天候情報を取得できませんでした。" };
  try {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${config.latitude}&longitude=${config.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=7&timezone=Asia%2FTokyo`, { cache: "no-store", signal: controller.signal }); clearTimeout(timer);
    if (response.ok) { const data = await response.json() as { daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_sum?: number[] } }; const maxes = data.daily?.temperature_2m_max ?? []; const mins = data.daily?.temperature_2m_min ?? []; const rain = data.daily?.precipitation_sum ?? []; const maxTemperature = maxes.length ? Math.max(...maxes) : null; const minTemperature = mins.length ? Math.min(...mins) : null; const precipitation = rain.reduce((sum,value) => sum + value, 0); weather = { maxTemperature, minTemperature, precipitation, summary: `今後7日：最高${maxTemperature ?? "-"}℃／最低${minTemperature ?? "-"}℃／降水量${Math.round(precipitation)}mm` }; }
  } catch { /* 天候取得失敗は在庫管理を止めない */ }
  const month = new Date().getMonth() + 1;
  const seasonalWords = month <= 2 || month === 12 ? ["冬","暖房","コート","防寒","加湿"] : month <= 5 ? ["春","新生活","収納","入学","花粉"] : month <= 8 ? ["夏","冷房","扇風機","アウトドア","水着"] : ["秋","衣替え","防災","ハロウィン","暖房"];
  const weatherWords = [...((weather.minTemperature ?? 99) <= 10 ? ["暖房","防寒","コート"] : []), ...((weather.maxTemperature ?? 0) >= 28 ? ["冷房","扇風機","夏"] : []), ...((weather.precipitation ?? 0) >= 30 ? ["雨","防水","傘"] : [])];
  const soldPrices = soldListings.map((entry) => entry.price).sort((a,b) => a-b); const medianSoldPrice = soldPrices.length ? soldPrices[Math.floor(soldPrices.length / 2)] : null;
  const recommendations = inventories.map((inventory) => { const reserved = inventory.marketplaceListings.reduce((sum,entry) => sum + entry.listedQuantity, 0); const available = Math.max(inventory.quantity - reserved, 0); const text = `${inventory.item.name} ${inventory.item.majorCategory ?? ""}`; const score = [...seasonalWords, ...weatherWords].filter((word) => text.includes(word)).length * 20 + Math.min(available, 5) * 5 + Math.min(Math.floor((Date.now() - inventory.updatedAt.getTime()) / 86_400_000 / 30), 5) * 10; return { inventoryInstanceId: inventory.id, itemName: inventory.item.name, category: inventory.item.majorCategory, totalQuantity: inventory.quantity, fleaMarketReserved: reserved, storageAvailable: available, score, reasons: [...seasonalWords, ...weatherWords].filter((word) => text.includes(word)).map((word) => `${word}需要と関連`), acquisitionCost: inventory.acquisitionCost, packageWeightGrams: inventory.packageWeightGrams, packageLengthCm: inventory.packageLengthCm, packageWidthCm: inventory.packageWidthCm, packageHeightCm: inventory.packageHeightCm }; }).filter((entry) => entry.storageAvailable > 0).sort((a,b) => b.score - a.score).slice(0, 30);
  return NextResponse.json({ setting: config, weather, seasonalWords, medianSoldPrice, soldSampleCount: soldPrices.length, recommendations });
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request); if (auth.response || !auth.user) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null; const action = stringValue(body?.action, 50);
  if (action === "SAVE_RECOMMENDATION_SETTING") {
    const latitude = Number(body?.latitude); const longitude = Number(body?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return NextResponse.json({ message: "地域の緯度・経度を確認してください。" }, { status: 400 });
    const setting = await prisma.salesRecommendationSetting.upsert({ where: { id: "system" }, create: { id: "system", regionName: stringValue(body?.regionName,100) || "設定地域", latitude, longitude, packagingCostDefault: numberValue(body?.packagingCostDefault) ?? 100, targetProfitRateBps: numberValue(body?.targetProfitRateBps,0,10000) ?? 2000 }, update: { regionName: stringValue(body?.regionName,100) || "設定地域", latitude, longitude, packagingCostDefault: numberValue(body?.packagingCostDefault) ?? 100, targetProfitRateBps: numberValue(body?.targetProfitRateBps,0,10000) ?? 2000 } });
    return NextResponse.json({ setting, message: "販売提案設定を更新しました。" });
  }
  if (action === "SAVE_INVENTORY_SPECS") {
    const id = stringValue(body?.inventoryInstanceId,100); if (!id) return NextResponse.json({ message: "在庫を指定してください。" }, { status: 400 });
    const inventory = await prisma.inventoryInstance.update({ where: { id }, data: { acquisitionCost: numberValue(body?.acquisitionCost), packageWeightGrams: numberValue(body?.packageWeightGrams), packageLengthCm: numberValue(body?.packageLengthCm), packageWidthCm: numberValue(body?.packageWidthCm), packageHeightCm: numberValue(body?.packageHeightCm) } });
    return NextResponse.json({ inventory, message: "原価と梱包情報を保存しました。" });
  }
  if (action === "SAVE_SHIPPING_RATE") {
    const fee = numberValue(body?.fee); const methodName = stringValue(body?.methodName,100); if (fee === null || !methodName) return NextResponse.json({ message: "発送方法と送料を入力してください。" }, { status: 400 });
    const rate = await prisma.shippingRate.create({ data: { channel: stringValue(body?.channel,50) || "all", carrier: stringValue(body?.carrier,100) || "配送会社", methodName, fee, maxWeightGrams: numberValue(body?.maxWeightGrams), maxTotalDimensionsCm: numberValue(body?.maxTotalDimensionsCm), anonymous: body?.anonymous === true, tracking: body?.tracking !== false, compensation: body?.compensation === true, effectiveFrom: new Date() } });
    return NextResponse.json({ rate, message: "送料表へ追加しました。" });
  }
  if (action === "UPDATE_CHANNEL") {
    const channel = stringValue(body?.channel,50); const mode = stringValue(body?.integrationMode,20); if (!channel || !["MANUAL","CSV","OFFICIAL_API"].includes(mode)) return NextResponse.json({ message: "連携方式が正しくありません。" }, { status: 400 });
    const setting = await prisma.salesChannelSetting.update({ where: { channel }, data: { integrationMode: mode, feeRateBps: numberValue(body?.feeRateBps,0,10000) ?? 1000, credentialEnvKey: mode === "OFFICIAL_API" ? stringValue(body?.credentialEnvKey,100) || null : null, lastSyncStatus: mode === "OFFICIAL_API" ? "CONFIGURATION_REQUIRED" : "READY", lastSyncMessage: mode === "OFFICIAL_API" ? "公式契約と認証情報の設定後に同期できます。" : null } });
    return NextResponse.json({ setting, message: "販売チャネル設定を更新しました。" });
  }
  return NextResponse.json({ message: "操作を確認できませんでした。" }, { status: 400 });
}
