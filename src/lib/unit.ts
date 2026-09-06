export const DEFAULT_UNITS = ["個", "箱", "本", "枚", "袋", "台", "冊", "セット", "ケース", "kg", "g", "L", "mL"];
export function unitValidationMessage(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return "単位は「個」「箱」などの名称で指定してください。";
  const text = value.normalize("NFKC").trim();
  if (!text || text.length > 30 || /^[\d\s.,+\-]+$/.test(text)) return "単位に数量は入力できません。「個」「箱」などを選択・追加してください。";
  return null;
}
export function displayUnit(value: string | null | undefined, fallback?: string | null) {
  if (value && !unitValidationMessage(value)) return value;
  if (fallback && !unitValidationMessage(fallback)) return fallback;
  return "（単位未設定）";
}
