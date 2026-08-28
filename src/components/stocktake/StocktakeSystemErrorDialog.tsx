"use client";

import Link from "next/link";
import { useEffect } from "react";

type Props = {
  code: string;
  message: string;
  reportId: string | null;
  provisional: boolean;
  isAdmin: boolean;
  onClose: () => void;
};

export default function StocktakeSystemErrorDialog({
  code,
  message,
  reportId,
  provisional,
  isAdmin,
  onClose,
}: Props) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 8000);
    return () => window.clearTimeout(timer);
  }, [code, onClose]);

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/75 p-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="stocktake-system-error-title"
        className="w-full max-w-lg rounded-3xl border-2 border-red-300 bg-white p-6 shadow-2xl"
      >
        <p className="text-sm font-black text-red-700">システムエラー</p>
        <h2 id="stocktake-system-error-title" className="mt-1 text-2xl font-black text-slate-950">
          自動復旧を完了できませんでした
        </h2>
        <p className="mt-4 font-semibold leading-7 text-slate-800">{message}</p>
        <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-xs font-bold text-slate-300">エラーコード</p>
          <p className="mt-1 break-all font-mono text-sm font-black">{code}</p>
          {reportId && (
            <p className="mt-2 break-all text-xs text-slate-300">受付番号：{reportId}</p>
          )}
        </div>
        {provisional && (
          <p className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">
            今回の棚卸は端末内へ簡易保存しました。作業は続けられます。管理者が復旧完了にすると、この端末から正式登録されます。
          </p>
        )}
        <p className="mt-3 text-center text-xs font-bold text-slate-600">
          この表示は8秒後に自動で閉じます。未解決の間は画面左下に状態を表示します。
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {isAdmin && (
            <Link
              href="/admin/error-reports"
              className="rounded-xl bg-red-700 px-5 py-3 text-center font-black text-white hover:bg-red-800"
            >
              管理者復旧を開く
            </Link>
          )}
          <button
            type="button"
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
