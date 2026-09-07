export type ScanPayload = { type: "CLASSIFICATION" | "LOCATION" | "ITEM" | "INVALID"; code?: string; name?: string; id?: string };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
function decode(value: string) { try { return decodeURIComponent(value).trim(); } catch { return value.trim(); } }
export function parseScan(raw: string): ScanPayload {
  const value = raw.trim();
  if (!value || value.length > 4096) return { type: "INVALID" };
  if (/^[{[]/.test(value)) {
    try {
      const data: unknown = JSON.parse(value);
      if (!data || typeof data !== "object" || Array.isArray(data)) return { type: "INVALID" };
      const row = data as Record<string, unknown>;
      if (row.type === "INVENTORY_LOCATION_LABEL") {
        const id = text(row.storageLocationId), name = text(row.storageLocationName);
        return id || name ? { type: "LOCATION", id, name } : { type: "INVALID" };
      }
      const code = text(row.classificationLabelCode), name = text(row.majorCategory) || text(row.category);
      if (code || name) return { type: "CLASSIFICATION", code, name: decode(name) };
      const itemCode = text(row.inventoryInstanceId) || text(row.janCode) || text(row.systemBarcode);
      return itemCode ? { type: "ITEM", code: itemCode } : { type: "INVALID" };
    } catch { return { type: "INVALID" }; }
  }
  const category = value.match(/^(?:INVENTORY_OS:CATEGORY:MAJOR:|CATEGORY:|大分類:)(.+)$/i);
  if (category) return { type: "CLASSIFICATION", name: decode(category[1]) };
  if (/^(?:https?:|SELECT\s|INSERT\s|UPDATE\s|DELETE\s)/i.test(value)) return { type: "INVALID" };
  return { type: "ITEM", code: value };
}

export function scanDisplayText(raw: string) {
  const parsed = parseScan(raw);
  if (parsed.type === "CLASSIFICATION") return "大分類QRを読み取りました";
  if (parsed.type === "LOCATION") return "保管場所QRを読み取りました";
  if (parsed.type === "INVALID") return "対応していないQRです";
  return parsed.code ?? "";
}
