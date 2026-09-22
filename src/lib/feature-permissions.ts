export const FEATURE_KEYS = [
  "STOCKTAKE",
  "CATALOG",
  "ITEM_EDIT",
  "INVENTORY_EDIT",
  "STOCKTAKE_HISTORY",
  "ITEM_REGISTER",
  "STOCKTAKE_START",
  "MARKETPLACE",
  "MARKETPLACE_SETTINGS",
  "EXPIRY",
  "LABEL_PRINT",
  "CAMERA_OPTIONAL",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, { title: string; description: string }> = {
  ITEM_EDIT:{title:"商品情報の編集",description:"棚卸中も商品名・JAN・メーカー・標準分類・写真を編集できます。商品・在庫検索も有効になります。"},
  INVENTORY_EDIT:{title:"在庫明細の編集",description:"棚卸中も選択した明細の数量・分類・保管場所・Lot・期限を編集できます。廃止・一括操作は含みません。"},
  STOCKTAKE_START:{title:"新しい棚卸の作成",description:"新しい棚卸を開始（既存棚卸の続きとは別に設定）"},
  MARKETPLACE:{title:"フリマ作業",description:"在庫から出品、販売・発送を記録"},
  MARKETPLACE_SETTINGS:{title:"フリマの販売設定",description:"販売先・配送方法・料金の設定変更"},
  EXPIRY:{title:"期限管理",description:"期限の確認・対応状況の記録"},
  LABEL_PRINT:{title:"JAN・QRの印刷",description:"システムのラベル印刷機能を利用"},
  CAMERA_OPTIONAL:{title:"カメラを使わず作業",description:"この人はカメラ許可を必須にせず、検索・手入力で作業可"},
  STOCKTAKE: { title: "棚卸作業", description: "担当する棚卸の入力・一時停止・再開・入力完了。商品・在庫の編集は別途許可が必要です。" },
  CATALOG: { title: "商品・在庫検索", description: "商品、在庫、保管場所、ロット、印刷の統合画面" },
  STOCKTAKE_HISTORY: { title: "棚卸履歴", description: "実施済み棚卸と結果の確認" },
  ITEM_REGISTER: { title: "商品登録", description: "棚卸中に未登録商品と在庫を追加" },
};

export const DEFAULT_WORKER_FEATURES: FeatureKey[] = [
  "STOCKTAKE",
  "CATALOG",
  "STOCKTAKE_HISTORY",
  "STOCKTAKE_START", "MARKETPLACE", "MARKETPLACE_SETTINGS", "EXPIRY", "LABEL_PRINT",
];

export function normalizeFeaturePermissions(value: unknown): FeatureKey[] {
  if (!Array.isArray(value)) return [];
  const selected = FEATURE_KEYS.filter((key) => value.includes(key));
  if (selected.some(key => key === "ITEM_EDIT" || key === "INVENTORY_EDIT") && !selected.includes("CATALOG")) selected.push("CATALOG");
  return FEATURE_KEYS.filter(key => selected.includes(key));
}

export function requiredFeature(
  pathname: string,
  method: string,
  hasStocktakeSession = false
): FeatureKey | null {
  if(pathname==="/api/stocktake/options")return null;
  if(pathname==="/api/print/authorize")return "LABEL_PRINT";
  if(pathname.startsWith("/admin/marketplace/settings")||pathname.startsWith("/api/admin/marketplace/settings"))return "MARKETPLACE_SETTINGS";
  if(pathname.startsWith("/marketplace")||pathname.startsWith("/admin/marketplace")||pathname.startsWith("/api/admin/marketplace"))return "MARKETPLACE";
  if(method==="POST"&&(pathname==="/api/stocktake/start"||pathname==="/api/stocktake"))return "STOCKTAKE_START";
  if (pathname === "/stocktake/history") return "STOCKTAKE_HISTORY";
  if (pathname === "/api/stocktake/register-item") return "ITEM_REGISTER";
  if (pathname.startsWith("/inventory-search") || pathname === "/inventory") {
    return "CATALOG";
  }
  if (pathname === "/expiry" || pathname === "/api/expiry") {
    return "EXPIRY";
  }
  if (pathname === "/api/inventory/search") {
    return hasStocktakeSession ? "STOCKTAKE" : "CATALOG";
  }
  if (pathname.startsWith("/items") || (pathname.startsWith("/api/items") && method === "GET")) {
    return "CATALOG";
  }
  if (pathname.startsWith("/stocktake") || pathname.startsWith("/api/stocktake")) {
    return "STOCKTAKE";
  }
  return null;
}

export function requiredFeatures(pathname:string,method:string,hasSession=false):FeatureKey[]{const feature=requiredFeature(pathname,method,hasSession);return feature==="STOCKTAKE_START"?["STOCKTAKE",feature]:feature==="MARKETPLACE_SETTINGS"?["MARKETPLACE",feature]:feature?[feature]:[];}

export type EditFeature = "ITEM_EDIT" | "INVENTORY_EDIT";
export function editFeatureForRoute(path:string,method:string):EditFeature|null {
  if(method==="PUT" && /^\/api\/items\/[^/]+$/.test(path) && !["/api/items/bulk","/api/items/system-barcode","/api/items/register","/api/items/search"].includes(path))return "ITEM_EDIT";
  if((method==="POST" && /^\/api\/items\/[^/]+\/photos$/.test(path)) || (method==="DELETE" && /^\/api\/items\/[^/]+\/photos\/[^/]+$/.test(path)))return "ITEM_EDIT";
  if(method==="PATCH" && /^\/api\/inventory\/[^/]+$/.test(path) && !["/api/inventory/update","/api/inventory/search"].includes(path))return "INVENTORY_EDIT";
  return null;
}
export function toggleFeaturePermission(current:FeatureKey[],feature:FeatureKey):FeatureKey[]{
  if(current.includes(feature))return current.filter(key=>key!==feature && !(feature==="CATALOG" && (key==="ITEM_EDIT"||key==="INVENTORY_EDIT")));
  return normalizeFeaturePermissions([...current,feature]);
}
