export type ManagementDestination = {
  href: string;
  title: string;
  description: string;
  keywords: string[];
};
export type ManagementSection = {
  id: string;
  title: string;
  description: string;
  destinations: ManagementDestination[];
};

/** Single source of truth for administrative navigation.
 * Features remain implemented on their existing pages; this reorganizes discovery only.
 * The data reset route is deliberately isolated in a separate destructive section.
 */
export const managementSections: ManagementSection[] = [
  {
    id: "work",
    title: "棚卸・日々の業務",
    description: "進捗、差異、販売や実施記録を確認する",
    destinations: [
      { href: "/admin/stocktake", title: "棚卸の進捗・確認待ち", description: "実施中、中断中、競合、完了待ちの棚卸を確認・管理", keywords: ["棚卸管理", "進捗", "差異", "中断", "再開", "レビュー"] },
      { href: "/stocktake/history", title: "棚卸結果・履歴", description: "過去の棚卸結果・担当者・差異を確認", keywords: ["記録", "結果", "棚卸履歴"] },
      { href: "/marketplace", title: "販売・出品・発送", description: "出品準備から売却、発送、在庫減算まで", keywords: ["フリマ", "販売", "売却", "発送"] },
      { href: "/admin/marketplace/settings", title: "販売・配送の設定", description: "販売チャネル、送料や配送条件を調整", keywords: ["フリマ", "料金", "設定", "連携"] },
      { href: "/admin/activity", title: "作業ジャーナル", description: "日付・担当者・商品から操作や作業記録を探す", keywords: ["作業履歴", "日報", "担当者"] },
    ],
  },
  {
    id: "catalog",
    title: "商品・在庫を整える",
    description: "商品情報と在庫明細を整理し、必要なときだけ一括変更する",
    destinations: [
      { href: "/items", title: "商品・在庫を検索・一括管理", description: "商品共通情報、ロット、在庫、削除済みデータを管理", keywords: ["JAN", "編集", "削除", "復元", "一括", "分類", "ロット"] },
      { href: "/add", title: "商品・在庫を登録", description: "新しい商品・在庫やシステムJANを登録", keywords: ["商品追加", "新規", "JAN"] },
      { href: "/admin/classifications", title: "分類・保管場所を整理", description: "分類名、保管場所、商品の割り当てを管理", keywords: ["大分類", "小分類", "場所", "移動", "統合"] },
      { href: "/import", title: "CSV・外部データを取り込む", description: "重複を確認して商品・在庫をまとめて登録", keywords: ["zaico", "CSV", "一括登録", "インポート"] },
      { href: "/expiry", title: "期限を確認・対応", description: "期限接近・期限切れや対応履歴を管理", keywords: ["使用期限", "賞味期限", "通知"] },
    ],
  },
  {
    id: "people",
    title: "利用者・権限",
    description: "利用できる機能とアカウントを管理する",
    destinations: [
      { href: "/admin/users", title: "利用者と権限を管理", description: "追加・停止・編集権限・パスワード再設定", keywords: ["スタッフ", "ユーザー", "権限", "アカウント"] },
      { href: "/account/password", title: "自分のパスワードを変更", description: "ログイン中の自分の認証情報を変更", keywords: ["パスワード", "セキュリティ"] },
    ],
  },
  {
    id: "system",
    title: "システムを守る・点検する",
    description: "診断、エラー、バックアップ、運用設定",
    destinations: [
      { href: "/admin/system-check", title: "システム全体の点検", description: "DB・権限・棚卸状態・整合性の検査", keywords: ["ヘルスチェック", "診断", "システム点検"] },
      { href: "/admin/error-reports", title: "エラー・対応履歴", description: "障害と対応状況、操作記録を確認", keywords: ["ログ", "監査", "障害", "復旧レポート"] },
      { href: "/admin/recovery", title: "診断と復旧", description: "原因を確認してから必要な復旧作業を実行", keywords: ["エラー", "復旧", "修復"] },
      { href: "/admin/export", title: "データのCSV出力", description: "商品・在庫・棚卸履歴・監査ログの出力", keywords: ["バックアップ", "CSV", "ダウンロード"] },
      { href: "/admin/operation-mode", title: "運用モードを設定", description: "通常・テスト・メンテナンスの切り替え", keywords: ["メンテナンス", "テスト", "制限"] },
    ],
  },
];

export const managementShortcuts = [
  "/admin/stocktake",
  "/items",
  "/admin/users",
  "/admin/system-check",
] as const;

export const destructiveDestinations: ManagementDestination[] = [
  { href: "/reset", title: "データ初期化", description: "対象を確認してシステム内のデータを初期化する。通常の整理や削除には使用しない", keywords: ["リセット", "全削除", "初期化", "危険"] },
];

export function filterManagementSections(query: string) {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase("ja");
  if (!normalized) return managementSections;
  return managementSections
    .map(section => ({
      ...section,
      destinations: section.destinations.filter(destination =>
        [section.title, destination.title, destination.description, ...destination.keywords]
          .join(" ").normalize("NFKC").toLocaleLowerCase("ja").includes(normalized)
      ),
    }))
    .filter(section => section.destinations.length > 0);
}

export function managementDestination(href: string) {
  return managementSections.flatMap(section => section.destinations)
    .find(destination => destination.href === href);
}
