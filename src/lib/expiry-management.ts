export type ExpiryLevel = "EXPIRED" | "TODAY" | "CRITICAL" | "WARNING" | "UPCOMING" | "SAFE" | "INVALID" | "NONE";

export type ExpiryAssessment = {
  level: ExpiryLevel;
  daysRemaining: number | null;
  label: string;
  action: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  const expiry = utcDay(expirationDate);
  const base = utcDay(today);
  if (expiry === null || base === null) return { level: "INVALID", daysRemaining: null, label: "日付形式異常", action: "商品詳細で期限を正しい日付へ修正してください。" };
  const days = Math.round((expiry - base) / 86_400_000);
  if (days < 0) return { level: "EXPIRED", daysRemaining: days, label: `${Math.abs(days)}日超過`, action: "使用・出品を止め、現物確認後に廃棄・返品・期限訂正を記録してください。" };
  if (days === 0) return { level: "TODAY", daysRemaining: 0, label: "本日期限", action: "本日中に使用可否を確認し、保留・消費・廃棄の判断を記録してください。" };
  if (days <= 7) return { level: "CRITICAL", daysRemaining: days, label: `残り${days}日`, action: "優先使用・値下げ・出品見直しを行い、対応状況を記録してください。" };
  if (days <= Math.max(8, alertDays)) return { level: "WARNING", daysRemaining: days, label: `残り${days}日`, action: "使用・販売計画を決め、期限前に処理できるよう確認してください。" };
  if (days <= 90) return { level: "UPCOMING", daysRemaining: days, label: `残り${days}日`, action: "次回確認日まで保管状態を維持してください。" };
  return { level: "SAFE", daysRemaining: days, label: `残り${days}日`, action: "現在対応は不要です。" };
}
