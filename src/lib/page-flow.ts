export function pageParent(path: string): { href: string; label: string } {
  if (/^\/stocktake\/[^/]+\/result$/.test(path)) return { href: "/stocktake/history", label: "棚卸一覧へ戻る" };
  if (path.startsWith("/stocktake/") && !["/stocktake/start","/stocktake/history"].includes(path)) return { href: "/stocktake/start", label: "棚卸一覧へ戻る" };
  if (path.startsWith("/notifications/")) return { href:"/notifications",label:"通知一覧へ戻る" };
  if (path.startsWith("/items/")) return { href: "/items", label: "商品一覧へ戻る" };
  if (path.startsWith("/admin/marketplace/")) return { href: "/marketplace", label: "フリマへ戻る" };
  if (["/add", "/import", "/reset"].includes(path)) return { href: "/admin", label: "管理センターへ戻る" };
  if (path.startsWith("/admin/")) return { href: "/admin", label: "管理センターへ戻る" };
  return { href: "/", label: "ホームへ戻る" };
}
export const publicPage = (path: string) => ["/login","/setup","/install","/offline","/maintenance"].includes(path);

export function pageTitle(path: string) {
  const explicit: Record<string,string> = {
    "/admin": "管理センター",
    "/admin/stocktake": "棚卸全体の管理",
    "/admin/users": "利用者・権限",
    "/admin/classifications": "分類・保管場所",
    "/admin/activity": "作業ジャーナル",
    "/admin/system-check": "システム点検",
    "/admin/recovery": "診断・復旧",
    "/admin/error-reports": "エラー・対応履歴",
    "/admin/export": "CSV出力",
    "/admin/operation-mode": "運用モード",
    "/admin/marketplace/settings": "販売・配送の設定",
    "/import": "データ取り込み",
    "/reset": "データ初期化",
  };
  if (explicit[path]) return explicit[path];
  if (path.startsWith("/notifications")) return "通知";
  if (path.startsWith("/items") || path === "/inventory" || path === "/inventory-search") return "商品・在庫";
  if (path.startsWith("/stocktake")) return "棚卸";
  if (path.startsWith("/marketplace") || path.startsWith("/admin/marketplace")) return "フリマ";
  if (path.startsWith("/admin")) return "管理センター";
  if (path === "/expiry") return "期限管理";
  if (path === "/add") return "商品登録";
  return "Inventory OS";
}

export function notificationReturnPath(value: string | null | undefined) { return value && /^\/notifications\/[A-Za-z0-9_-]{1,100}$/.test(value) ? value : "/"; }
