"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application screen error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section
        role="alert"
        className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-6 text-center shadow-xl sm:p-8"
      >
        <p className="text-sm font-black text-red-700">画面エラー</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">
          この画面を表示できませんでした
        </h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">
          入力済みの内容がある場合は控えてから、もう一度読み込んでください。
        </p>
        {error.digest && (
          <p className="mt-3 text-xs font-bold text-slate-600">
            問い合わせ番号: {error.digest}
          </p>
        )}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-blue-700 px-5 py-3 font-black text-white hover:bg-blue-800"
          >
            もう一度試す
          </button>
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-black text-slate-800 hover:bg-slate-50"
          >
            ホームへ戻る
          </button>
        </div>
      </section>
    </main>
  );
}
