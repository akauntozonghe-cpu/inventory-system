export const FEATURE_KEYS = [
  "STOCKTAKE",
  "INVENTORY_SEARCH",
  "ITEM_VIEW",
  "STOCKTAKE_HISTORY",
  "ITEM_REGISTER",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, { title: string; description: string }> = {
  STOCKTAKE: { title: "棚卸作業", description: "棚卸の開始・再開・入力・完了" },
  INVENTORY_SEARCH: { title: "在庫検索", description: "JAN・商品名・分類からの在庫検索" },
  ITEM_VIEW: { title: "商品一覧・詳細", description: "商品情報・在庫・バーコードの閲覧" },
  STOCKTAKE_HISTORY: { title: "棚卸履歴", description: "実施済み棚卸と結果の確認" },
  ITEM_REGISTER: { title: "商品登録", description: "棚卸中に未登録商品と在庫を追加" },
};

export const DEFAULT_WORKER_FEATURES: FeatureKey[] = [
  "STOCKTAKE",
  "INVENTORY_SEARCH",
  "ITEM_VIEW",
  "STOCKTAKE_HISTORY",
];

export function normalizeFeaturePermissions(value: unknown): FeatureKey[] {
  if (!Array.isArray(value)) return [];
  return FEATURE_KEYS.filter((key) => value.includes(key));
}

export function requiredFeature(
  pathname: string,
  method: string,
  hasStocktakeSession = false
): FeatureKey | null {
  if (pathname === "/stocktake/history") return "STOCKTAKE_HISTORY";
  if (pathname === "/api/stocktake/register-item") return "ITEM_REGISTER";
  if (pathname.startsWith("/inventory-search") || pathname === "/inventory") {
    return "INVENTORY_SEARCH";
  }
  if (pathname === "/api/inventory/search") {
    return hasStocktakeSession ? "STOCKTAKE" : "INVENTORY_SEARCH";
  }
  if (pathname.startsWith("/items") || (pathname.startsWith("/api/items") && method === "GET")) {
    return "ITEM_VIEW";
  }
  if (pathname.startsWith("/stocktake") || pathname.startsWith("/api/stocktake")) {
    return "STOCKTAKE";
  }
  return null;
}
