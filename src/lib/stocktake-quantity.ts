export function parseStocktakeQuantity(value: string): number | null {
  const normalized = value.normalize("NFKC").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const quantity = Number(normalized);
  return Number.isSafeInteger(quantity) ? quantity : null;
}

export function stepStocktakeQuantity(value: string, delta: -1 | 1): string {
  const quantity = parseStocktakeQuantity(value);
  if (quantity === null) return value;
  return String(Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, quantity + delta)));
}
