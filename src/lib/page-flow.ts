export function pageParent(path: string): { href: string; label: string } {
  if (/^\/stocktake\/[^/]+\/result$/.test(path)) return { href: "/stocktake/history", label: "棚卸一覧へ戻る" };
  if (path.startsWith("/stocktake/") && !["/stocktake/start","/stocktake/history"].includes(path)) return { href: "/stocktake/start", label: "棚卸一覧へ戻る" };
  if (path.startsWith("/items/")) return { href: "/items", label: "商品一覧へ戻る" };
  if (path.startsWith("/admin/marketplace/")) return { href: "/marketplace", label: "フリマへ戻る" };
  if (path.startsWith("/admin/")) return { href: "/admin", label: "管理者設定へ戻る" };
  return { href: "/", label: "ホームへ戻る" };
}
export const publicPage = (path: string) => ["/login","/setup","/install","/offline","/maintenance"].includes(path);
export function needsEntryRedirect(path: string, navigationType: string, referrer: string, origin: string) {
  if (publicPage(path) || ["/","/notifications","/account/password"].includes(path) || navigationType !== "navigate") return false;
  try { return !referrer || new URL(referrer).origin !== origin; } catch { return true; }
}
