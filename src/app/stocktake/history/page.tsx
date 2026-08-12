"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type StocktakeStatus =
  | "IN_PROGRESS"
  | "PAUSED"
  | "REVIEW"
  | "CONFLICT"
  | "COMPLETED"
  | "CANCELLED";

type StocktakeSession = {
  id: string;
  title: string;
  operator: string | null;
  scopeLabel: string | null;
  status: StocktakeStatus;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  operatorUser: {
    id: string;
    username: string;
    displayName: string;
  } | null;
  targetCount: number;
  recordedCount: number;
  progressPercent: number;
};

type SessionResponse = {
  success: boolean;
  code: string;
  isAdmin: boolean;
  scope: "ALL" | "MINE";
  sessions: StocktakeSession[];
};

type ApiError = {
  code?: string;
  message?: string;
};

function getMessage(value: unknown, fallback: string) {
  if (
    value !== null &&
    typeof value === "object" &&
    "message" in value &&
    typeof (value as ApiError).message === "string"
  ) {
    return (value as ApiError).message ?? fallback;
  }

  return fallback;
}

function isSessionResponse(value: unknown): value is SessionResponse {
  return (
    value !== null &&
    typeof value === "object" &&
    "sessions" in value &&
    Array.isArray((value as SessionResponse).sessions)
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(`サーバー応答が空です。HTTP ${response.status}`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `サーバー応答を読み取れませんでした。HTTP ${response.status}`
    );
  }
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusInfo(status: StocktakeStatus) {
  const values: Record<
    StocktakeStatus,
    { label: string; className: string }
  > = {
    IN_PROGRESS: {
      label: "作業中",
      className: "bg-blue-100 text-blue-800",
    },
    PAUSED: {
      label: "中断中",
      className: "bg-orange-100 text-orange-800",
    },
    REVIEW: {
      label: "確認待ち",
      className: "bg-amber-100 text-amber-800",
    },
    CONFLICT: {
      label: "競合あり",
      className: "bg-red-100 text-red-800",
    },
    COMPLETED: {
      label: "完了",
      className: "bg-emerald-100 text-emerald-800",
    },
    CANCELLED: {
      label: "取消済み",
      className: "bg-slate-200 text-slate-700",
    },
  };

  return values[status];
}

export default function StocktakeHistoryPage() {
  const router = useRouter();

  const [sessions, setSessions] = useState<StocktakeSession[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (all = showAll) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/stocktake/session${all ? "?all=true" : ""}`,
        { cache: "no-store" }
      );

      const data = await readJson(response);

      if (response.status === 401) {
        router.replace("/login?next=/stocktake/history");
        return;
      }

      if (!response.ok) {
        throw new Error(
          getMessage(data, "棚卸履歴を取得できませんでした。")
        );
      }

      if (!isSessionResponse(data)) {
        throw new Error("棚卸履歴の形式が正しくありません。");
      }

      setSessions(data.sessions);
      setIsAdmin(data.isAdmin);
      setShowAll(all);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "棚卸履歴を取得できませんでした。"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayedSessions = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (!normalizedKeyword) return sessions;

    return sessions.filter((session) => {
      const searchText = [
        session.title,
        session.operator,
        session.operatorUser?.displayName,
        session.operatorUser?.username,
        session.scopeLabel,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase();

      return searchText.includes(normalizedKeyword);
    });
  }, [keyword, sessions]);

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black tracking-widest text-blue-600">
              STOCKTAKE HISTORY
            </p>

            <h1 className="mt-1 text-3xl font-black">棚卸履歴</h1>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              {showAll
                ? "全担当者の棚卸履歴を表示しています。"
                : "自分が担当した棚卸履歴を表示しています。"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <Link
                href="/admin/stocktake"
                className="rounded-xl bg-violet-600 px-4 py-3 font-bold text-white"
              >
                全棚卸管理
              </Link>
            )}

            <Link
              href="/"
              className="rounded-xl bg-slate-700 px-4 py-3 font-bold text-white"
            >
              ホームへ戻る
            </Link>
          </div>
        </header>

        <section className="mt-6 rounded-3xl bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="棚卸名・担当者・範囲で検索"
              className="min-h-12 min-w-0 flex-1 rounded-2xl border-2 border-slate-200 px-4 outline-none focus:border-blue-500"
            />

            <button
              type="button"
              onClick={() => void load(showAll)}
              className="min-h-12 rounded-2xl bg-blue-600 px-5 font-black text-white"
            >
              更新
            </button>
          </div>

          {isAdmin && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void load(false)}
                className={`rounded-full px-4 py-2 text-sm font-bold ${
                  !showAll
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                自分の履歴
              </button>

              <button
                type="button"
                onClick={() => void load(true)}
                className={`rounded-full px-4 py-2 text-sm font-bold ${
                  showAll
                    ? "bg-violet-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                全員の履歴
              </button>
            </div>
          )}
        </section>

        {error && (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="font-black text-red-700">
              STOCKTAKE_HISTORY_ERROR
            </p>

            <p className="mt-2 text-sm text-red-800">{error}</p>

            <button
              type="button"
              onClick={() => void load(showAll)}
              className="mt-4 rounded-xl bg-red-700 px-4 py-2 font-bold text-white"
            >
              再試行
            </button>
          </section>
        )}

        {loading ? (
          <section className="mt-6 rounded-3xl bg-white p-10 text-center font-bold text-slate-500 shadow-sm">
            棚卸履歴を読み込んでいます…
          </section>
        ) : displayedSessions.length === 0 ? (
          <section className="mt-6 rounded-3xl bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-black">棚卸履歴はありません</h2>
            <p className="mt-2 text-slate-600">
              まだ棚卸が開始されていないか、検索条件に一致しません。
            </p>
          </section>
        ) : (
          <section className="mt-6 space-y-4">
            {displayedSessions.map((session) => {
              const status = statusInfo(session.status);

              const loginOperator =
                session.operatorUser?.displayName ?? "ログイン記録なし";

              const changedOperator =
                Boolean(session.operator) &&
                Boolean(session.operatorUser?.displayName) &&
                session.operator !== session.operatorUser?.displayName;

              return (
                <article
                  key={session.id}
                  className="rounded-3xl bg-white p-5 shadow-sm sm:p-6"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black">{session.title}</h2>

                        <span
                          className={`rounded-full px-3 py-1 text-sm font-bold ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-slate-600">
                        対象：{session.scopeLabel ?? "全在庫"}
                      </p>

                      <p className="mt-1 text-sm text-slate-600">
                        開始：{formatDate(session.startedAt)}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={`/stocktake/${encodeURIComponent(session.id)}`}
                        className="rounded-xl bg-slate-700 px-4 py-3 text-center font-bold text-white"
                      >
                        作業画面
                      </Link>

                      <Link
                        href={`/stocktake/${encodeURIComponent(
                          session.id
                        )}/result`}
                        className="rounded-xl bg-blue-600 px-4 py-3 text-center font-bold text-white"
                      >
                        結果を見る
                      </Link>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-4">
                    <HistoryInfo
                      label="進捗"
                      value={`${session.recordedCount} / ${session.targetCount} 件`}
                      subValue={`${session.progressPercent}%`}
                    />

                    <HistoryInfo
                      label="ログイン実施者"
                      value={loginOperator}
                    />

                    <HistoryInfo
                      label="入力担当者名"
                      value={session.operator ?? "未入力"}
                      subValue={
                        changedOperator
                          ? "ログイン実施者と異なります"
                          : undefined
                      }
                      warning={changedOperator}
                    />

                    <HistoryInfo
                      label={
                        session.status === "COMPLETED"
                          ? "完了日時"
                          : session.status === "PAUSED"
                            ? "中断日時"
                            : "現在の状態"
                      }
                      value={
                        session.status === "COMPLETED"
                          ? formatDate(session.completedAt)
                          : session.status === "PAUSED"
                            ? formatDate(session.pausedAt)
                            : status.label
                      }
                    />
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

function HistoryInfo({
  label,
  value,
  subValue,
  warning = false,
}: {
  label: string;
  value: string;
  subValue?: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold text-slate-500">{label}</p>

      <p className="mt-1 break-words font-black">{value}</p>

      {subValue && (
        <p
          className={`mt-1 text-xs font-bold ${
            warning ? "text-orange-600" : "text-blue-600"
          }`}
        >
          {subValue}
        </p>
      )}
    </div>
  );
}