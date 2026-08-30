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
  if (/AUTH|REAUTH|ELEVATION|PASSWORD/.test(code)) {
    return {
      action: "入力内容を確認してもう一度認証してください。解決しない場合は、別の全機能利用者に復旧を依頼してください。",
      adminSteps: ["本人のIDとパスワードで再認証する", "利用者が有効で全機能を許可されているか確認する", "再認証後に元の操作をもう一度実行する", "成功後、エラーレポートを解決済みにする"],
      recoveryRoute: "/admin/users",
    };
  }

  if (/MARKETPLACE/.test(code)) {
    return {
      action: "フリマ情報を自動再取得します。入力内容は変えず、復旧結果が表示されるまでお待ちください。",
      adminSteps: ["パスワードで復旧操作を認証する", "システム点検でDB接続とフリマ用データを確認する", "フリマ設定で利用中の販売先を確認する", "フリマ画面を再読込して一覧が表示されることを確認する", "エラーレポートへ対応結果を記録する"],
      recoveryRoute: "/admin/system-check",
    };
  }

  if (/DATABASE|DB_|PRISMA|SCHEMA|P2021|P2022/.test(code)) {
    return {
      action: "自動復旧と再接続を実行します。終わらない場合は、システム管理の点検結果からDB補修を確認してください。",
      adminSteps: ["パスワードで復旧操作を認証する", "システム点検を実行する", "DB・移行状態の異常項目に表示された補修を実行する", "再点検が正常になったことを確認する", "エラーレポートへ対応結果を記録する"],
      recoveryRoute: "/admin/system-check",
    };
  }

  if (/STOCKTAKE/.test(code)) {
    return {
      action: "入力は端末内へ保持し、接続回復後に自動同期します。同じ商品を重ねて入力しないでください。",
      adminSteps: ["パスワードで復旧操作を認証する", "棚卸管理で対象セッションの状態を確認する", "競合・確認待ちを画面の指示に沿って処理する", "簡易保存件数が0件になるまで同期する", "結果とエラーレポートを確認して完了にする"],
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
    action: "自動再試行後も解決しない場合は、エラーコードを変更せずに復旧レポートを開いてください。",
    adminSteps: ["パスワードで復旧操作を認証する", "エラーコード・発生画面・発生時刻を確認する", "レポートに表示された復旧先を開く", "同じ操作で正常動作を確認する", "対応内容を記録して解決済みにする"],
    recoveryRoute: "/admin/error-reports",
  };
}
