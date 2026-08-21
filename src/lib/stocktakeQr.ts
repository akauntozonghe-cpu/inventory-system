export type StocktakeQr =
  | { type: "PRODUCT"; value: string }
  | { type: "MAJOR_CATEGORY"; value: string }
  | { type: "MINOR_CATEGORY"; value: string }
  | { type: "LOCATION"; value: string };

const TYPE_ALIASES: Record<string, StocktakeQr["type"]> = {
  PRODUCT: "PRODUCT", ITEM: "PRODUCT", JAN: "PRODUCT", BARCODE: "PRODUCT", "商品": "PRODUCT",
  MAJOR_CATEGORY: "MAJOR_CATEGORY", MAJOR: "MAJOR_CATEGORY", "大分類": "MAJOR_CATEGORY",
  MINOR_CATEGORY: "MINOR_CATEGORY", MINOR: "MINOR_CATEGORY", "小分類": "MINOR_CATEGORY",
  LOCATION: "LOCATION", STORAGE_LOCATION: "LOCATION", "保管場所": "LOCATION",
};

function normalized(type: unknown, value: unknown): StocktakeQr | null {
  if (typeof type !== "string" || typeof value !== "string") return null;
  const resolvedType = TYPE_ALIASES[type.trim().toUpperCase()] ?? TYPE_ALIASES[type.trim()];
  const resolvedValue = value.trim();
  return resolvedType && resolvedValue ? { type: resolvedType, value: resolvedValue } : null;
}

export function parseStocktakeQr(rawValue: string): StocktakeQr {
  const raw = rawValue.trim();
  if (!raw) return { type: "PRODUCT", value: "" };

  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const parsed = normalized(data.type ?? data.kind ?? data.qrType, data.value ?? data.code ?? data.name ?? data.id);
    if (parsed) return parsed;
  } catch {
    // JSON以外のQRは、URL・接頭辞形式として続けて判定する。
  }

  try {
    const url = new URL(raw);
    const parsed = normalized(
      url.searchParams.get("type") ?? url.searchParams.get("kind") ?? url.searchParams.get("qrType"),
      url.searchParams.get("value") ?? url.searchParams.get("code") ?? url.searchParams.get("name") ?? url.searchParams.get("id")
    );
    if (parsed) return parsed;
  } catch {
    // URL以外は接頭辞形式として続けて判定する。
  }

  const separator = raw.match(/^([^:=|]+)\s*[:=|]\s*(.+)$/);
  const prefixed = separator ? normalized(separator[1], separator[2]) : null;
  return prefixed ?? { type: "PRODUCT", value: raw };
}
