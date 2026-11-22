export const CLASSIFICATION_WORKSPACE_KEY = "inventory:classification-workspace:v1";

export type ClassificationView = "ITEMS" | "MASTERS" | "PRINT";
export type ClassificationWorkspace = {
  view: ClassificationView;
  itemSearch: string;
  masterSearch: string;
  majorFilter: string;
  minorFilter: string;
  locationFilter: string;
  selectedOnly: boolean;
  selectedIds: string[];
  page: number;
};

const views: readonly string[] = ["ITEMS", "MASTERS", "PRINT"];
export function classificationView(value: string | null | undefined): ClassificationView | null {
  return value && views.includes(value) ? value as ClassificationView : null;
}

/** A safe internal return destination, never an arbitrary redirect or URL. */
export function classificationReturnTo(value: string | null | undefined): string | null {
  if (!value || value.length > 250 || !value.startsWith("/admin/classifications")) return null;
  try {
    const url = new URL(value, "https://inventory.invalid");
    if (url.origin !== "https://inventory.invalid" || url.pathname !== "/admin/classifications") return null;
    if ([...url.searchParams.keys()].some(key => key !== "view")) return null;
    const requested = url.searchParams.get("view");
    if (requested !== null && !classificationView(requested)) return null;
    return requested ? `/admin/classifications?view=${requested}` : "/admin/classifications";
  } catch { return null; }
}

export function classificationItemHref(itemId: string, inventoryId?: string) {
  const params = new URLSearchParams({returnTo:"/admin/classifications?view=ITEMS"});
  if (inventoryId) params.set("inventoryId", inventoryId);
  return `/items/${encodeURIComponent(itemId)}?${params.toString()}`;
}

export function parseClassificationWorkspace(raw: string | null): ClassificationWorkspace | null {
  if (!raw || raw.length > 32000) return null;
  try {
    const value:unknown=JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string,unknown>;
    if (!classificationView(typeof row.view === "string" ? row.view : null)) return null;
    const read = (field: string,max=200) => typeof row[field] === "string"
      ? String(row[field]).slice(0,max) : "";
    return {
      view:classificationView(String(row.view))!,
      itemSearch:read("itemSearch"),masterSearch:read("masterSearch"),
      majorFilter:read("majorFilter",100)||"ALL",minorFilter:read("minorFilter",100),
      locationFilter:read("locationFilter",100),
      selectedOnly:row.selectedOnly===true,
      selectedIds:Array.isArray(row.selectedIds)
        ? [...new Set(row.selectedIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 120))].slice(0,500)
        : [],
      page:typeof row.page === "number" && Number.isInteger(row.page) && row.page >= 1
        ? Math.min(row.page,100000) : 1,
    };
  } catch { return null; }
}
