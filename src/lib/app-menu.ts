import type { FeatureKey } from "./feature-permissions";
type MenuLink = { href: string; label: string; feature?: FeatureKey; admin?: boolean };
export const appMenu: ReadonlyArray<{ title: string; links: MenuLink[] }> = [
  {title:"作業",links:[{href:"/",label:"ホーム"},{href:"/stocktake/start",label:"棚卸を開始・再開",feature:"STOCKTAKE"},{href:"/stocktake/history",label:"棚卸の結果・履歴",feature:"STOCKTAKE_HISTORY"},{href:"/items",label:"商品・在庫を検索",feature:"CATALOG"},{href:"/expiry",label:"期限を確認",feature:"CATALOG"},{href:"/add",label:"商品を登録",admin:true}]},
  {title:"フリマ",links:[{href:"/marketplace",label:"出品・発送"},{href:"/admin/marketplace/advisor",label:"価格・送料を試算"},{href:"/admin/marketplace/settings",label:"販売・配送の設定"}]},
  {title:"設定",links:[{href:"/account/password",label:"パスワード変更"},{href:"/admin",label:"管理者設定",admin:true},{href:"/admin/classifications",label:"分類・保管場所・JANの整理",admin:true},{href:"/admin/category-qr",label:"大分類QRを印刷",admin:true},{href:"/admin/users",label:"ユーザー・権限管理",admin:true},{href:"/admin/system-check",label:"システム点検・復旧",admin:true}]},
];
export function visibleAppMenu(user: { role: string; featurePermissions?: string[] }) {
  return appMenu.map(group=>({...group,links:group.links.filter(link=>(!link.admin||user.role==="ADMIN")&&(!link.feature||user.role==="ADMIN"||user.featurePermissions?.includes(link.feature)))})).filter(group=>group.links.length);
}
