export type ExpiryLevel = "EXPIRED" | "TODAY" | "CRITICAL" | "WARNING" | "UPCOMING" | "SAFE" | "INVALID" | "NONE";

export type ExpiryAssessment = {
  level: ExpiryLevel;
  daysRemaining: number | null;
  label: string;
  action: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export function normalizeExpirationDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const source = String(value).normalize("NFKC").trim();
  if (/^(?:no\s*data|n\/a|なし|期限なし|未登録|-)$/i.test(source)) return null;
  const japanese = source.match(/^(\d{4})年\s*(\d{1,2})月(?:\s*(\d{1,2})日?)?$/);
  if (japanese) {
    const [, year, month, day] = japanese;
    return normalizeExpirationDate(`${year}-${month.padStart(2, "0")}${day ? `-${day.padStart(2, "0")}` : ""}`);
  }
  const separated = source.match(/^(\d{4})[/.\-](\d{1,2})(?:[/.\-](\d{1,2}))?$/);
  if (separated) {
    const [, year, month, day] = separated;
    return normalizeExpirationDate(`${year}-${month.padStart(2, "0")}${day ? `-${day.padStart(2, "0")}` : ""}`);
  }
  const digits = source.replace(/\s/g, "");
  if (/^\d{6}$/.test(digits)) return normalizeExpirationDate(`${digits.slice(0, 4)}-${digits.slice(4, 6)}`);
  if (/^\d{8,9}$/.test(digits)) {
    const monthDay = digits.slice(-4);
    return normalizeExpirationDate(`${digits.slice(0, 4)}-${monthDay.slice(0, 2)}-${monthDay.slice(2, 4)}`);
  }
  const normalized = source;
  if (MONTH_PATTERN.test(normalized)) {
    const [year, month] = normalized.split("-").map(Number);
    return year >= 1900 && year <= 9999 && month >= 1 && month <= 12 ? normalized : undefined;
  }
  return utcDay(normalized) === null ? undefined : normalized;
}

export function formatExpirationDate(value: string | null | undefined) {
  if (!value) return "-";
  if (MONTH_PATTERN.test(value)) {
    const [year, month] = value.split("-");
    return `${year}年${Number(month)}月`;
  }
  const normalized = normalizeExpirationDate(value);
  if (!normalized) return value;
  const [year, month, day] = normalized.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function expirationEffectiveDate(value: string | null | undefined): string | null {
  const normalized = normalizeExpirationDate(value);
  if (!normalized) return null;
  if (!MONTH_PATTERN.test(normalized)) return normalized;
  const [year, month] = normalized.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

export function dateKeyInJapan(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function utcDay(value: string) {
  if (!DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const time = Date.UTC(year, month - 1, day);
  const parsed = new Date(time);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return time;
}

export function assessExpiry(expirationDate: string | null | undefined, alertDays = 30, today = dateKeyInJapan()): ExpiryAssessment {
  if (!expirationDate) return { level: "NONE", daysRemaining: null, label: "期限未設定", action: "期限がある商品は使用期限を登録してください。" };
  const effectiveDate = expirationEffectiveDate(expirationDate);
  const expiry = effectiveDate ? utcDay(effectiveDate) : null;
  const base = utcDay(today);
  if (expiry === null || base === null) return { level: "INVALID", daysRemaining: null, label: "日付形式異常", action: "商品詳細で期限を正しい日付へ修正してください。" };
  const days = Math.round((expiry - base) / 86_400_000);
  const monthSuffix = MONTH_PATTERN.test(expirationDate) ? "（月末基準）" : "";
  if (days < 0) return { level: "EXPIRED", daysRemaining: days, label: `${Math.abs(days)}日超過${monthSuffix}`, action: "使用・出品を止め、現物確認後に廃棄・返品・期限訂正を記録してください。" };
  if (days === 0) return { level: "TODAY", daysRemaining: 0, label: "本日期限", action: "本日中に使用可否を確認し、保留・消費・廃棄の判断を記録してください。" };
  if (days <= 7) return { level: "CRITICAL", daysRemaining: days, label: `残り${days}日${monthSuffix}`, action: "優先使用・値下げ・出品見直しを行い、対応状況を記録してください。" };
  if (days <= Math.max(8, alertDays)) return { level: "WARNING", daysRemaining: days, label: `残り${days}日${monthSuffix}`, action: "使用・販売計画を決め、期限前に処理できるよう確認してください。" };
  if (days <= 90) return { level: "UPCOMING", daysRemaining: days, label: `残り${days}日${monthSuffix}`, action: "次回確認日まで保管状態を維持してください。" };
  return { level: "SAFE", daysRemaining: days, label: `残り${days}日${monthSuffix}`, action: "現在対応は不要です。" };
}
