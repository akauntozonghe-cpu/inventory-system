import { canVisit } from "./app-access";
import type { FeatureKey } from "./feature-permissions";

type MenuLink = { href: string; label: string; feature?: FeatureKey; admin?: boolean };
export const appMenu: ReadonlyArray<{ title: string; links: MenuLink[] }> = [
  { title: "日々の作業", links: [
    { href: "/", label: "ホーム" },
    { href: "/stocktake/start", label: "棚卸を開始・再開", feature: "STOCKTAKE" },
    { href: "/items", label: "商品・在庫を探す", feature: "CATALOG" },
    { href: "/expiry", label: "期限を確認", feature: "EXPIRY" },
    { href: "/marketplace", label: "出品・売却・発送", feature: "MARKETPLACE" },
    { href: "/stocktake/history", label: "棚卸結果・履歴", feature: "STOCKTAKE_HISTORY" },
  ] },
  { title: "管理者の操作", links: [
    { href: "/admin", label: "管理センター（すべての管理機能）", admin: true },
    { href: "/admin/stocktake", label: "棚卸全体を管理", admin: true },
    { href: "/admin/classifications", label: "分類・保管場所を管理", admin: true },
    { href: "/admin/users", label: "利用者・権限を管理", admin: true },
    { href: "/admin/system-check", label: "システムを点検", admin: true },
  ] },
  { title: "自分・端末の設定", links: [
    { href: "/account/password", label: "自分のパスワード変更" },
    { href: "/admin/marketplace/settings", label: "販売・配送の設定", feature: "MARKETPLACE_SETTINGS" },
  ] },
];

export function visibleAppMenu(user: { role: string; featurePermissions?: string[] }) {
  return appMenu
    .map(group => ({
      ...group,
      links: group.links.filter(link => canVisit({
        id: "", displayName: "", ...user, featurePermissions: user.featurePermissions ?? [],
      }, link.href)),
    }))
    .filter(group => group.links.length > 0);
}
