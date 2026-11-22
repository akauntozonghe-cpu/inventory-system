export type ErrorGuidance = {
  action: string;
  adminSteps: string[];
  recoveryRoute: string;
};

const CODE_PATTERN = /(?:エラーコード[：:]\s*|^|[（(])([A-Z][A-Z0-9_]{3,})(?:[）)]|\s*[:：])?/;

export function extractErrorCode(message: string, fallback = "CLIENT_UNCLASSIFIED_ERROR") {
  return message.match(CODE_PATTERN)?.[1] ?? fallback;
}

export function getErrorGuidance(code: string): ErrorGuidance {
  if (code === "CLASSIFICATION_IN_USE" || code === "CLASSIFICATION_UNASSIGN_BLOCKED") {
    return {
      action: "削除の対象が商品・在庫・棚卸などから参照されています。分類・保管場所の整理で「削除・廃止」を開き、使用状況と商品名を確認してください。在庫が0でも商品に分類が残る場合は、分類を一括解除・移動・統合できます。",
      adminSteps: [
        "分類・保管場所の整理で該当する分類を選ぶ",
        "削除・廃止で商品・在庫・棚卸・登録申請の参照件数を確認する",
        "紐づいている商品を確認して、分類を一括解除・移動・統合する",
        "一覧の件数を再読込し、参照がないことを確かめて削除する",
      ],
      recoveryRoute: "/admin/classifications",
    };
  }
  if (code === "LOCATION_IN_USE" || code === "LOCATION_HISTORICAL_REQUESTS") {
    return {
      action: "保管場所を参照している在庫や登録申請・棚卸があります。分類・保管場所の整理で使用状況を確認し、移動・統合ができるか調べてください。履歴を壊す場合は操作できません。",
      adminSteps: [
        "保管場所の「削除・廃止」で現在の参照先を確認する",
        "現在の在庫と進行中の棚卸を確認する",
        "履歴を守れる範囲で保管場所を変更・統合する",
        "参照が解消されたら削除する",
      ],
      recoveryRoute: "/admin/classifications",
    };
  }
  if (/AUTH|REAUTH|ELEVATION|PASSWORD/.test(code)) {
    return {
      action: "入力内容を確認してもう一度認証してください。解決しない場合は、別の全機能利用者に復旧を依頼してください。",
      adminSteps: ["本人のIDとパスワードで再認証する", "利用者が有効で全機能を許可されているか確認する", "再認証後に元の操作をもう一度実行する", "成功後、エラーレポートを解決済みにする"],
      recoveryRoute: "/admin/users",
    };
  }

  if (/MARKETPLACE/.test(code)) {
    return {
      action: "フリマの処理が完了したことを確認できませんでした。出品・取消・在庫の状態を読み直してから、未完了の操作だけを行ってください。",
      adminSteps: ["パスワードで復旧操作を認証する", "システム点検でDB接続とフリマ用データを確認する", "フリマ設定で利用中の販売先を確認する", "フリマ画面を再読込して一覧が表示されることを確認する", "エラーレポートへ対応結果を記録する"],
      recoveryRoute: "/admin/system-check",
    };
  }

  if (/DATABASE|DB_|PRISMA|SCHEMA|P2021|P2022/.test(code)) {
    return {
      action: "保存先の情報を取得できませんでした。通信を確認して再チェックしてください。保存結果が不明な操作は繰り返さないでください。",
      adminSteps: ["パスワードで復旧操作を認証する", "システム点検を実行する", "接続できない場合は同じ変更を繰り返さず、接続回復後に保存状態を確認する", "再点検が正常になったことを確認する", "エラーレポートへ対応結果を記録する"],
      recoveryRoute: "/admin/system-check",
    };
  }

  if (/STOCKTAKE/.test(code)) {
    return {
      action: "この棚卸の処理を完了できませんでした。保存状態は棚卸画面の表示で確認してください。反映結果が不明な間は同じ数量を重ねて登録しないでください。",
      adminSteps: ["パスワードで復旧操作を認証する", "棚卸管理で対象セッションの状態を確認する", "対象の棚卸名・担当者・保存済み記録を確認し、表示された対象だけを処置する", "簡易保存件数が0件になるまで同期する", "結果とエラーレポートを確認して完了にする"],
      recoveryRoute: "/admin/stocktake",
    };
  }

  if (/SYSTEM_CHECK|SYSTEM_REMEDIATION/.test(code)) {
    return {
      action: "異常項目の対応手順を確認し、表示された復旧操作を実行してください。安全に自動修復できない変更は勝手に確定しません。",
      adminSteps: ["パスワードで復旧操作を認証する", "異常項目の期待値・実測値・対応方法を確認する", "表示された復旧操作を実行する", "同じ点検を再実行して正常を確認する", "エラーレポートへ対応内容を記録して解決済みにする"],
      recoveryRoute: "/admin/system-check",
    };
  }

  return {
    action: "処理結果を確認できませんでした。対象の一覧を再読み込みして、保存状態と変更内容を確認してください。結果が不明な操作は繰り返さず、エラーコードを控えてシステムの診断画面で確認してください。",
    adminSteps: ["パスワードで復旧操作を認証する", "エラーコード・発生画面・発生時刻を確認する", "このエラーを選んで診断し、対象と変更内容を確認して処置する", "同じ操作で正常動作を確認する", "対応内容を記録して解決済みにする"],
    recoveryRoute: "/admin/error-reports",
  };
}
