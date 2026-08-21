"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

const CONFIRMATION_TEXT = "RESET_ALL_INVENTORY_DATA";

type ResetResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  confirmationText?: string;
  deleted?: {
    sessionCount: number;
    recordCount: number;
    targetCount: number;
    historyCount: number;
    inventoryCount: number;
    itemCount: number;
    locationCount: number;
  };
};

async function readResponse(response: Response): Promise<ResetResponse> {
  const text = await response.text();

  if (!text) {
    return {
      success: false,
      code: "RESET_EMPTY_RESPONSE",
      message: "サーバーから応答がありませんでした。",
    };
  }

  try {
    return JSON.parse(text) as ResetResponse;
  } catch {
    return {
      success: false,
      code: "RESET_INVALID_RESPONSE",
      message: "サーバー応答を読み取れませんでした。",
    };
  }
}

export default function ResetPage() {
  const router = useRouter();

  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [deleted, setDeleted] =
    useState<ResetResponse["deleted"]>(undefined);

  const canReset = confirmation === CONFIRMATION_TEXT && !loading;

  const reset = async () => {
    if (!canReset) {
      return;
    }

    setLoading(true);
    setMessage("");
    setErrorCode("");
    setDeleted(undefined);

    try {
      const response = await fetch("/api/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmation,
        }),
      });

      const data = await readResponse(response);

      if (!response.ok || !data.success) {
        setErrorCode(data.code ?? "RESET_FAILED");
        setMessage(
          data.message ?? "データ初期化に失敗しました。"
        );
        return;
      }

      setDeleted(data.deleted);
      setMessage(
        data.message ?? "データ初期化が完了しました。"
      );
      setConfirmation("");

      window.setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 4000);
    } catch {
      setErrorCode("RESET_NETWORK_ERROR");
      setMessage("通信に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-4 sm:p-8">
      <Link
        href="/"
        className="inline-flex rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
      >
        ← ホームへ戻る
      </Link>

      <section className="mt-4 rounded-3xl border border-red-200 bg-white p-5 shadow-sm sm:p-8">
        <p className="text-sm font-bold text-red-600">
          管理者専用・危険な操作
        </p>

        <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">
          データ初期化
        </h1>

        <p className="mt-4 leading-7 text-slate-600">
          棚卸、在庫、商品、保管場所、履歴をすべて削除します。
          この操作は取り消せません。
        </p>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <p className="font-bold">削除されるデータ</p>

          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>棚卸セッション・棚卸記録・棚卸対象</li>
            <li>在庫と在庫履歴</li>
            <li>商品マスタと保管場所</li>
          </ul>

          <p className="mt-3">
            ユーザー情報、管理者アカウント、エラーレポートは削除されません。
          </p>
        </div>

        <label className="mt-6 block">
          <span className="text-sm font-bold text-slate-800">
            実行するには、次の文字列をそのまま入力してください
          </span>

          <code className="mt-2 block rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white">
            {CONFIRMATION_TEXT}
          </code>

          <input
            value={confirmation}
            onChange={(event) =>
              setConfirmation(event.target.value)
            }
            autoComplete="off"
            spellCheck={false}
            placeholder="確認文字列を入力"
            className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
          />
        </label>

        <button
          type="button"
          onClick={reset}
          disabled={!canReset}
          className="mt-5 w-full rounded-xl bg-red-600 px-4 py-3 font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "初期化しています…" : "すべてのデータを初期化する"}
        </button>

        {message && (
          <div
            className={`mt-5 rounded-2xl border p-4 ${
              errorCode
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            <p className="font-bold">{message}</p>

            {errorCode && (
              <p className="mt-1 text-sm">
                エラーコード：{errorCode}
              </p>
            )}

            {deleted && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <p>棚卸：{deleted.sessionCount}件</p>
                <p>棚卸記録：{deleted.recordCount}件</p>
                <p>在庫：{deleted.inventoryCount}件</p>
                <p>商品：{deleted.itemCount}件</p>
                <p>保管場所：{deleted.locationCount}件</p>
                <p>履歴：{deleted.historyCount}件</p>
              </div>
            )}

            {!errorCode && (
              <p className="mt-2 text-sm">
                数秒後にホームへ戻ります。
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}