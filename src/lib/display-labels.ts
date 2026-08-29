const ACTION_LABELS: Record<string, string> = {
  ADMIN_REAUTH_SUCCEEDED: "管理者再認証に成功",
  ITEM_SYSTEM_BARCODE_GENERATE: "商品バーコードを発行",
  ITEM_REGISTER: "商品を登録",
  ITEM_CREATE: "商品を追加",
  ITEM_UPDATE: "商品情報を変更",
  ITEM_DELETE: "商品を廃止",
  INVENTORY_CREATE: "在庫を追加",
  INVENTORY_UPDATE: "在庫情報を変更",
  INVENTORY_QUANTITY_UPDATE: "在庫数を変更",
  INVENTORY_DELETE: "在庫を廃止",
  INVENTORY_BULK_IMPORT: "在庫データを一括取込",
  STOCKTAKE_REGISTER_UNLISTED_ITEM: "棚卸中に未登録商品を登録",
  STOCKTAKE_CONFLICT_CANCELLED: "棚卸の競合を取消",
  ITEM_REGISTRATION_REQUEST_REJECT: "商品登録申請を却下",
  ITEM_REGISTRATION_REQUEST_APPROVE: "商品登録申請を承認",
  STORAGE_LOCATION_CREATE: "保管場所を追加",
  SYSTEM_CHECK_PAUSE_STOCKTAKE: "棚卸を一時停止",
  SYSTEM_CHECK_RESUME_STOCKTAKE: "棚卸を再開",
  SYSTEM_CHECK_CANCEL_STOCKTAKE: "棚卸を取消",
  SYSTEM_CHECK_ISSUE_SYSTEM_BARCODE: "点検から商品バーコードを発行",
  SYSTEM_OPERATION_MODE_UPDATE: "運用モードを変更",
  SYSTEM_RESET_ALL_INVENTORY_DATA: "在庫データを初期化",
  EXPORT_CSV_BACKUP: "バックアップを出力",
  ERROR_REPORT_RESOLVED: "エラー復旧を完了",
  ERROR_REPORT_DISMISSED: "エラーを対応不要として記録",
  ISOLATED_SYSTEM_TEST_SUCCEEDED: "隔離動作テストに成功",
  MARKETPLACE_LISTING_CREATE: "フリマ出品候補を追加",
  MARKETPLACE_LISTING_STATUS_UPDATE: "フリマ出品状態を変更",
  MARKETPLACE_SALE_APPLY: "フリマ販売を在庫へ反映",
  OPENING_BALANCE: "初期在庫を登録",
  RECEIPT: "入庫",
  ISSUE: "出庫",
  TRANSFER_IN: "移動先へ入庫",
  TRANSFER_OUT: "移動元から出庫",
  STOCKTAKE: "棚卸結果を反映",
  ADJUSTMENT: "在庫数を調整",
  DISPOSAL: "廃棄",
  RETURN: "返品",
  IMPORT: "データ取込",
};

export function displayActionLabel(value: string) {
  if (ACTION_LABELS[value]) return ACTION_LABELS[value];
  // 日本語で保存済みの履歴はそのまま表示する。
  if (/[ぁ-んァ-ヶ一-龠]/.test(value)) return value;
  // 未登録の内部識別子を画面へ露出させない。
  return "システム操作";
}
