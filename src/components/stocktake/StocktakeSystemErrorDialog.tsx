"use client";

import { useState } from "react";

type Props = {
  code: string;
  message: string;
  reportId: string | null;
  provisional: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onRetry: () => Promise<void> | void;
};

export default function StocktakeSystemErrorDialog({
  code,
  message,
  provisional,
  onClose,
  onRetry,
}: Props) {
  const [busy,setBusy]=useState(false),[retryError,setRetryError]=useState("");

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/75 p-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="stocktake-system-error-title"
        className="w-full max-w-lg rounded-3xl border-2 border-red-300 bg-white p-6 shadow-2xl"
      >
        <p className="text-sm font-black text-red-700">システムエラー</p>
        <h2 data-error-code={code} data-error-message={message} data-admin-recovery-title="true" id="stocktake-system-error-title" className="mt-1 text-2xl font-black text-slate-950">
          自動復旧を完了できませんでした
        </h2>
        <p className="mt-4 font-semibold leading-7 text-slate-800">{message}</p>
        <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-xs font-bold text-slate-300">エラーコード</p>
          <p className="mt-1 break-all font-mono text-sm font-black">{code}</p>

        </div>
        {provisional && (
          <p className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">
            端末内に簡易保存があります。まだ正式な在庫反映は確認できていません。作業へ戻り、簡易保存・未送信の件数と保存結果を確認してください。
          </p>
        )}
        <div className="mt-6">
          {!provisional && <p className="mb-3 text-sm">この表示だけでは保存済みか判断できません。元の画面で結果を確認し、同じ数量を重ねて登録しないでください。</p>}
          {retryError&&<p role="alert" className="mb-3 text-sm text-red-700">{retryError}</p>}
          <button type="button" disabled={busy} className="mb-3 mr-3 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50" onClick={async()=>{setBusy(true);setRetryError("");try{await onRetry();}catch{setRetryError("STOCKTAKE_RETRY_FAILED：再確認を完了できませんでした。作業へ戻って保存状態を確認してください。");}finally{setBusy(false);}}}>{busy?"再確認中…":"接続・保存状態を再確認"}</button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-black text-slate-900 hover:bg-slate-50"
          >
            作業へ戻る
          </button>
        </div>
      </section>
    </div>
  );
}
