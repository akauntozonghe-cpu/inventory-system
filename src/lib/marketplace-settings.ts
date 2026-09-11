export const PREFECTURES = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"] as const;

export function parseShippingPreferences(body: Record<string, unknown>) {
  const result: { shippingOriginPrefecture?: string | null; shippingLeadDays?: number | null } = {};
  if ("shippingOriginPrefecture" in body) {
    const origin = body.shippingOriginPrefecture;
    if (origin !== null && origin !== "" && (typeof origin !== "string" || !(PREFECTURES as readonly string[]).includes(origin))) throw new Error("発送地は都道府県から選んでください。");
    result.shippingOriginPrefecture = origin === "" ? null : origin as string | null;
  }
  if ("shippingLeadDays" in body) {
    const days = body.shippingLeadDays;
    if (days === "" || days === null) result.shippingLeadDays = null;
    else if (typeof days === "number" && Number.isInteger(days) && days >= 1 && days <= 7) result.shippingLeadDays = days;
    else throw new Error("発送までの日数は1〜7日で選んでください。");
  }
  return result;
}

// The shared target is a calendar-day deadline in Japan, independent of marketplace contracts.
export function shippingDeadline(soldAt: Date, days: number | null | undefined): Date | null {
  if (!days || !Number.isInteger(days) || days < 1 || days > 7) return null;
  const japan = new Date(soldAt.getTime() + 9 * 3600000);
  return new Date(Date.UTC(japan.getUTCFullYear(), japan.getUTCMonth(), japan.getUTCDate() + days + 1) - 9 * 3600000 - 1);
}

export function marketplaceTakeHome(price: number, quantity: number, feeBps: number | null, shipping: number | null, packaging: number | null, fee: number | null = null): number | null {
  if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0 || shipping === null || packaging === null || (fee === null && feeBps === null)) return null;
  if (![shipping, packaging, fee ?? feeBps!].every(n => Number.isFinite(n) && n >= 0)) return null;
  return price * quantity - (fee ?? Math.ceil(price * quantity * feeBps! / 10000)) - shipping - packaging;
}
