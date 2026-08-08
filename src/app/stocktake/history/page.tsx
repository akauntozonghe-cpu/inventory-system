"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StocktakeHistory = {
  id: string;
  title: string;
  status: "IN_PROGRESS" | "PAUSED" | "COMPLETED";
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  scopeLabel: string | null;
  operator: string | null;
  operatorUser: {
    username: string;
    displayName: string;
  } | null;
  targetCount: number;
  recordedCount: number;
};

const statusLabel = {
  IN_PROGRESS: "棚卸中",
  PAUSED: "中断中",
  COMPLETED: "完了",
};

const statusClass = {
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  PAUSED: "bg-orange-50 text-orange-700",
  COMPLETED: "bg-green-50 text-green-700",
};

export default function StocktakeHistoryPage() {
  const router = useRouter();

  const [sessions, setSessions] = useState<StocktakeHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/stocktake/history");

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        const data = (await response.json()) as
          | StocktakeHistory[]
          | { code?: string; message?: string };

        if (!response.ok || !Array.isArray(data)) {
          const message =
            !Array.isArray(data) ? data.message : undefined;

          throw new Error(
            message ?? "棚卸履歴を取得できませんでした。"
          );
        }

        setSessions(data);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "棚卸履歴を取得できませんでした。"
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-widest text-blue-600">
              STOCKTAKE HISTORY
            </p>

            <h1 className="mt-1 text-3xl font-black">棚卸履歴</h1>

            <p className="mt-2 text-sm text-slate-600">
              管理者は全員分、作業者は自分が実施した棚卸を確認できます。
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.replace("/")}
            className="rounded-xl bg-slate-700 px-4 py-3 font-bold text-white"
          >
            ホームへ戻る
          </button>
        </header>

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700"
          >
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-8 text-slate-500">読み込み中...</p>
        ) : sessions.length === 0 ? (
          <section className="mt-8 rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="font-bold text-slate-600">
              棚卸履歴はまだありません。
            </p>
          </section>
        ) : (
          <section className="mt-8 space-y-4">
            {sessions.map((session) => {
              const isDifferentOperator =
                Boolean(session.operatorUser?.displayName) &&
                Boolean(session.operator) &&
                session.operatorUser?.displayName !== session.operator;

              const percent =
                session.targetCount === 0
                  ? 0
                  : Math.round(
                      (session.recordedCount / session.targetCount) * 100
                    );

              return (
                <article
                  key={session.id}
                  className="rounded-2xl bg-white p-5 shadow-sm sm:p-6"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black">{session.title}</h2>

                        <span
                          className={`rounded-full px-3 py-1 text-sm font-bold ${
                            statusClass[session.status]
                          }`}
                        >
                          {statusLabel[session.status]}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-slate-600">
                        対象：{session.scopeLabel ?? "全在庫"}
                      </p>

                      <p className="mt-1 text-sm text-slate-600">
                        開始：
                        {new Date(session.startedAt).toLocaleString("ja-JP")}
                      </p>
                    </div>

                    <Link
                      href={`/stocktake/${session.id}/result`}
                      className="rounded-xl bg-blue-600 px-4 py-3 text-center font-bold text-white"
                    >
                      結果を見る
                    </Link>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-bold text-slate-500">
                        進捗
                      </p>
                      <p className="mt-1 text-xl font-black">
                        {session.recordedCount} / {session.targetCount} 件
                      </p>
                      <p className="mt-1 text-sm font-bold text-blue-600">
                        {percent}%
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-bold text-slate-500">
                        実施者（ログイン）
                      </p>
                      <p className="mt-1 font-black">
                        {session.operatorUser?.displayName ?? "記録なし"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-bold text-slate-500">
                        担当者名（入力値）
                      </p>
                      <p className="mt-1 font-black">
                        {session.operator ?? "記録なし"}
                      </p>

                      {isDifferentOperator && (
                        <p className="mt-1 text-xs font-bold text-orange-600">
                          実施者と担当者名が異なります
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}