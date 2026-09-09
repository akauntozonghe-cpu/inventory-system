export function recoveryCheckCodes(route?: string, errorCode?: string): string[] | null {
  if (!route) return null; // The dedicated system inspection remains comprehensive.
  const base = ["CHECK_DATABASE_CONNECTION"];
  if (/PUSH|NOTIFICATION/.test(errorCode??"") || route==="/notifications") return [...base,"CHECK_PUSH_CONFIGURATION","CHECK_DEVICE_NOTIFICATION"];
  if (/PWA|SERVICE_WORKER/.test(errorCode??"")) return [...base,"CHECK_APP_UPDATE"];
  if (errorCode && /NETWORK|HTTP_50|FETCH|TIMEOUT|CONNECTION/.test(errorCode)) return base;
  if (/AUTH|LOGIN|PERMISSION|FORBIDDEN/.test(errorCode ?? "") || /login|account|users/.test(route)) return [...base, "CHECK_ACTIVE_ADMIN"];
  if (/BARCODE|JAN|IDENTIFIER/.test(errorCode ?? "")) return [...base, "CHECK_PRODUCT_IDENTIFIERS"];
  if (/stocktake/.test(route)) return [...base, "CHECK_REVIEW_RECORDS", "CHECK_STOCKTAKE_TARGET_LINK"];
  if (/items|inventory|classifications|register|marketplace/.test(route)) return [...base, "CHECK_PRODUCT_LINKS", "CHECK_INVALID_UNITS", "CHECK_MASTER_DATA"];
  return base;
}
export function recoverySessionId(route?: string, reportSessionId?: string | null) {
  return route?.match(/^\/stocktake\/([^/]+)(?:\/result)?$/)?.[1]?.replace(/^(start|history)$/, "") || reportSessionId || null;
}
export function recoveryActionAllowed(action: string, codes: string[] | null) {
  if (!codes) return true;
  if (action === "SYNC_PRODUCT_METADATA") return codes.includes("CHECK_PRODUCT_LINKS");
  if (action === "ISSUE_SYSTEM_BARCODE") return codes.includes("CHECK_PRODUCT_IDENTIFIERS");
  if (["PAUSE_SESSION","RESUME_SESSION","CANCEL_SESSION"].includes(action)) return codes.includes("CHECK_REVIEW_RECORDS");
  return false;
}
export function recoveryNextStep(route?: string, code?: string) {
  if (/PUSH|NOTIFICATION/.test(code??"") || route === "/notifications") return { href:"/notifications", text:"この端末の通知設定を開き、許可状態とテスト通知を確認する" };
  if (/AUTH|LOGIN/.test(code??"") || /login|account|users/.test(route??"")) return { href:"/account/password", text:"認証設定を確認し、元の操作でログイン状態を確認する" };
  if (route?.includes("marketplace")) return { href:"/marketplace", text:"対象の出品と在庫を確認し、必要ならタイトル3回から取消・差戻しする" };
  if (route?.includes("stocktake")) return { href:route, text:"対象の棚卸へ戻り、保存状態・中断状態を確認して続ける" };
  return { href:route??"/", text:"元の画面へ戻り、問題が起きた操作を確認する" };
}
