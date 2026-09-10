export function pageParent(path: string): { href: string; label: string } {
  if (/^\/stocktake\/[^/]+\/result$/.test(path)) return { href: "/stocktake/history", label: "棚卸一覧へ戻る" };
  if (path.startsWith("/stocktake/") && !["/stocktake/start","/stocktake/history"].includes(path)) return { href: "/stocktake/start", label: "棚卸一覧へ戻る" };
  if (path.startsWith("/notifications/")) return { href:"/notifications",label:"通知一覧へ戻る" };
  if (path.startsWith("/items/")) return { href: "/items", label: "商品一覧へ戻る" };
  if (path.startsWith("/admin/marketplace/")) return { href: "/marketplace", label: "フリマへ戻る" };
  if (path.startsWith("/admin/")) return { href: "/admin", label: "管理者設定へ戻る" };
  return { href: "/", label: "ホームへ戻る" };
}
export const publicPage = (path: string) => ["/login","/setup","/install","/offline","/maintenance"].includes(path);
export function needsEntryRedirect(path: string, navigationType: string, referrer: string, origin: string) {
  if (path.startsWith("/notifications/") || publicPage(path) || ["/","/notifications","/account/password"].includes(path) || navigationType !== "navigate") return false;
  try { return !referrer || new URL(referrer).origin !== origin; } catch { return true; }
}

export function pageTitle(path:string){if(path.startsWith("/notifications"))return "通知";if(path.startsWith("/items")||path==="/inventory"||path==="/inventory-search")return "商品・在庫";if(path.startsWith("/stocktake"))return "棚卸";if(path.startsWith("/marketplace")||path.startsWith("/admin/marketplace"))return "フリマ";if(path.startsWith("/admin"))return "管理者設定";if(path==="/expiry")return "期限管理";if(path==="/add")return "商品登録";return "Inventory OS";}

export function notificationReturnPath(value: string | null | undefined) { return value && /^\/notifications\/[A-Za-z0-9_-]{1,100}$/.test(value) ? value : "/"; }
