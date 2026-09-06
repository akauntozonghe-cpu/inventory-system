const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

export function normalizeDisplayText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").replace(CONTROL_CHARACTERS, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeOptionalText(value: unknown, maxLength: number) {
  return normalizeDisplayText(value, maxLength) || null;
}

export function normalizeIdentifier(value: unknown, maxLength: number) {
  const normalized = normalizeDisplayText(value, maxLength)
    .replace(/\s+/g, "")
    .toLocaleUpperCase("ja-JP");
  return normalized || null;
}

export function normalizeJanCode(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").replace(/[\s-]/g, "");
  return normalized || null;
}

export function janCodeValidationMessage(value: string | null) {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return "JANコードは数字だけで入力してください。";
  if (value.length !== 8 && value.length !== 13) return "JANコードは8桁または13桁で入力してください。";
  return null;
}

export function normalizeJanInput(value: string) {
  return value.normalize("NFKC").replace(/\D/g, "").slice(0, 13);
}
