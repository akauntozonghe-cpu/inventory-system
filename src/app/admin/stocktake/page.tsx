"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  cancelledAt: string | null;
  cancellationNote: string | null;
  targetCount: number;
  recordedCount: number;
  progressPercent: number;
  operatorUser?: {
    id: string;
    username: string;
    displayName: string;
  } | null;
};

type CurrentUser = {
  id: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
};

type SessionAction = "PAUSE" | "RESUME" | "COMPLETE";

function getMessage(value: unknown, fallback: string) {
  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }

  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: StocktakeStatus) {
  const labels: Record<StocktakeStatus, string> = {
    IN_PROGRESS: "作業中",
    PAUSED: "中断中",
    REVIEW: "確認待ち",
    CONFLICT: "整合性確認中",
    COMPLETED: "完了",
    CANCELLED: "取消済み",
  };

  return labels[status];
}

function statusStyle(status: StocktakeStatus) {
  const styles: Record<StocktakeStatus, string> = {
    IN_PROGRESS: "bg-blue-100 text-blue-700",
    PAUSED: "bg-amber-100 text-amber-800",
    REVIEW: "bg-violet-100 text-violet-700",
    CONFLICT: "bg-red-100 text-red-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    CANCELLED: "bg-slate-200 text-slate-700",
  };

  return styles[status];
}

function normalizeSessions(value: unknown): StocktakeSession[] {
  const source =
    Array.isArray(value)
      ? value
      : value &&
          typeof value === "object" &&
          "sessions" in value &&
          Array.isArray(value.sessions)
        ? value.sessions
        : [];

  return source.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;

    if (
      typeof record.id !== "string" ||
      typeof record.title !== "string" ||
      typeof record.status !== "string"
    ) {
      return [];
    }

    return [
      {
        id: record.id,
        title: record.title,
        operator:
          typeof record.operator === "string" ? record.operator : null,
        scopeLabel:
          typeof record.scopeLabel === "string"
            ? record.scopeLabel
            : null,
        status: record.status as StocktakeStatus,
        startedAt:
          typeof record.startedAt === "string"
            ? record.startedAt
            : "",
        pausedAt:
          typeof record.pausedAt === "string"
            ? record.pausedAt
            : null,
        completedAt:
          typeof record.completedAt === "string"
            ? record.completedAt
            : null,
        cancelledAt:
          typeof record.cancelledAt === "string"
            ? record.cancelledAt
            : null,
        cancellationNote:
          typeof record.cancellationNote === "string"
            ? record.cancellationNote
            : null,
        targetCount:
          typeof record.targetCount === "number"
            ? record.targetCount
            : 0,
        recordedCount:
          typeof record.recordedCount === "number"
            ? record.recordedCount
            : 0,
        progressPercent:
          typeof record.progressPercent === "number"
            ? record.progressPercent
            : 0,
        operatorUser:
          record.operatorUser &&
          typeof record.operatorUser === "object" &&
          "id" in record.operatorUser &&
          "displayName" in record.operatorUser &&
          typeof record.operatorUser.id === "string" &&
          typeof record.operatorUser.displayName === "string"
            ? {
                id: record.operatorUser.id,
                username:
                  "username" in record.operatorUser &&
                  typeof record.operatorUser.username === "string"
                    ? record.operatorUser.username
                    : "",
                displayName: record.operatorUser.displayName,
              }
            : null,
      },
    ];
  });
}

export default function AdminStocktakePage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [sessions, setSessions] = useState<StocktakeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<
    "ACTIVE" | "ALL" | "COMPLETED" | "ISSUES"
  >("ACTIVE");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [confirm, setConfirm] = useState<{
    session: StocktakeSession;
    action: SessionAction;
  } | null>(null);

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    setError("");

    try {
      const [userResponse, sessionResponse] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/stocktake/session?all=true", { cache: "no-store" }),
      ]);

      const [userData, sessionData] = await Promise.all([
        readJson(userResponse),
        readJson(sessionResponse),
      ]);

      if (!userResponse.ok) {
        router.replace("/login?next=/admin/stocktake");
        return;
      }

      const userCandidate =
        userData &&
        typeof userData === "object" &&
        "user" in userData &&
        userData.user &&
        typeof userData.user === "object"
          ? userData.user
          : userData;

      if (
        !userCandidate ||
        typeof userCandidate !== "object" ||
        !("id" in userCandidate) ||
        !("displayName" in userCandidate) ||
        !("role" in userCandidate) ||
        userCandidate.role !== "ADMIN"
      ) {
        router.replace("/");
        return;
      }

      if (!sessionResponse.ok) {
        throw new Error(
          getMessage(sessionData, "棚卸一覧を取得できませんでした。")
        );
      }

      setCurrentUser(userCandidate as CurrentUser);
      setSessions(normalizeSessions(sessionData));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "棚卸管理データを取得できませんでした。"
      );
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredSessions = useMemo(() => {
    if (filter === "ALL") {
      return sessions;
    }

    if (filter === "COMPLETED") {
      return sessions.filter(
        (session) =>
          session.status === "COMPLETED" ||
          session.status === "CANCELLED"
      );
    }

    if (filter === "ISSUES") {
      return sessions.filter(
        (session) =>
          session.status === "REVIEW" ||
          session.status === "CONFLICT"
      );
    }

    return sessions.filter(
      (session) =>
        session.status === "IN_PROGRESS" ||
        session.status === "PAUSED" ||
        session.status === "REVIEW" ||
        session.status === "CONFLICT"
    );
  }, [filter, sessions]);

  const summary = useMemo(
    () => ({
      active: sessions.filter(
        (session) =>
          session.status === "IN_PROGRESS" ||
          session.status === "PAUSED"
      ).length,
      review: sessions.filter(
        (session) =>
          session.status === "REVIEW" ||
          session.status === "CONFLICT"
      ).length,
      completed: sessions.filter(
        (session) => session.status === "COMPLETED"
      ).length,
    }),
    [sessions]
  );

  async function runAction(session: StocktakeSession, action: SessionAction) {
    setConfirm(null);
    setUpdatingId(session.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/stocktake/session/${encodeURIComponent(session.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(data, "棚卸状態を更新できませんでした。")
        );
      }

      if (action === "COMPLETE") {
        router.push(`/stocktake/${session.id}/result`);
        return;
      }

      setMessage(
        action === "PAUSE"
          ? `「${session.title}」を中断しました。`
          : `「${session.title}」を再開しました。`
      );

      await loadData(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "棚卸状態を更新できませんでした。"
      );
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <p className="text-slate-600">棚卸管理データを読み込んでいます…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black tracking-[0.14em] text-violet-600">
            ADMIN STOCKTAKE CONTROL
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            棚卸管理
          </h1>
          <p className="mt-2 text-slate-600">
            管理者：
            <span className="ml-1 font-bold text-slate-900">
              {currentUser?.displayName ?? "-"}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/stocktake/start"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-blue-600 px-5 font-bold text-white hover:bg-blue-700"
          >
            棚卸開始
          </Link>

          <Link
            href="/admin"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-800 px-5 font-bold text-white hover:bg-slate-700"
          >
            管理者設定へ
          </Link>
        </div>
      </header>

      {error && (
        <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          <p className="font-black">処理できませんでした</p>
          <p className="mt-1 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => void loadData()}
            className="mt-4 rounded-xl bg-red-700 px-4 py-3 text-sm font-bold text-white"
          >
            再読み込み
          </button>
        </section>
      )}

      {message && (
        <section className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          {message}
        </section>
      )}

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-sm font-bold text-slate-600">作業中・中断中</p>
          <p className="mt-2 text-3xl font-black text-blue-700">
            {summary.active}
          </p>
        </div>

        <div className="rounded-3xl border border-red-100 bg-red-50 p-5">
          <p className="text-sm font-bold text-slate-600">要確認</p>
          <p className="mt-2 text-3xl font-black text-red-700">
            {summary.review}
          </p>
        </div>

        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
          <p className="text-sm font-bold text-slate-600">完了</p>
          <p className="mt-2 text-3xl font-black text-emerald-700">
            {summary.completed}
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">
              棚卸セッション一覧
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              管理者はすべての棚卸の状態確認と状態変更を行えます。
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadData(false)}
            className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            更新
          </button>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {[
            ["ACTIVE", "進行中"],
            ["ISSUES", "要確認"],
            ["COMPLETED", "完了・取消"],
            ["ALL", "すべて"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                setFilter(
                  value as "ACTIVE" | "ALL" | "COMPLETED" | "ISSUES"
                )
              }
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
                filter === value
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-4">
          {filteredSessions.map((session) => {
            const busy = updatingId === session.id;

            return (
              <article
                key={session.id}
                className="rounded-2xl border border-slate-200 p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-lg font-black text-slate-950">
                        {session.title}
                      </h3>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyle(
                          session.status
                        )}`}
                      >
                        {statusLabel(session.status)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-x-8 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
                      <p>
                        担当者：
                        <span className="font-bold text-slate-800">
                          {session.operator ?? "-"}
                        </span>
                      </p>
                      <p>対象：{session.scopeLabel ?? "全在庫"}</p>
                      <p>
                        進捗：{session.recordedCount} / {session.targetCount} 件
                        （{session.progressPercent}%）
                      </p>
                      <p>開始：{formatDate(session.startedAt)}</p>
                    </div>

                    {session.status === "PAUSED" && (
                      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                        中断日時：{formatDate(session.pausedAt)}
                      </p>
                    )}

                    {session.status === "CONFLICT" && (
                      <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-800">
                        在庫数が棚卸開始時点から変更されています。結果画面で内容を確認してください。
                      </p>
                    )}

                    {session.status === "CANCELLED" &&
                      session.cancellationNote && (
                        <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
                          取消理由：{session.cancellationNote}
                        </p>
                      )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:flex lg:w-72 lg:flex-wrap lg:justify-end">
                    <Link
                      href={`/stocktake/${session.id}`}
                      className="flex min-h-11 items-center justify-center rounded-xl bg-slate-800 px-3 text-sm font-bold text-white hover:bg-slate-700"
                    >
                      作業画面
                    </Link>

                    <Link
                      href={`/stocktake/${session.id}/result`}
                      className="flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-3 text-sm font-bold text-white hover:bg-violet-700"
                    >
                      結果
                    </Link>

                    {session.status === "PAUSED" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setConfirm({
                            session,
                            action: "RESUME",
                          })
                        }
                        className="min-h-11 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-slate-400"
                      >
                        再開
                      </button>
                    )}

                    {session.status === "IN_PROGRESS" && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setConfirm({
                              session,
                              action: "PAUSE",
                            })
                          }
                          className="min-h-11 rounded-xl bg-amber-500 px-3 text-sm font-bold text-white hover:bg-amber-600 disabled:bg-slate-400"
                        >
                          中断
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setConfirm({
                              session,
                              action: "COMPLETE",
                            })
                          }
                          className="min-h-11 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-slate-400"
                        >
                          終了
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {filteredSessions.length === 0 && (
            <section className="rounded-2xl bg-slate-50 p-8 text-center text-slate-600">
              該当する棚卸はありません。
            </section>
          )}
        </div>
      </section>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-xs font-black tracking-[0.14em] text-violet-600">
              ADMIN ACTION
            </p>

            <h2 className="mt-2 text-xl font-black text-slate-950">
              {confirm.action === "PAUSE"
                ? "棚卸を中断しますか？"
                : confirm.action === "RESUME"
                  ? "棚卸を再開しますか？"
                  : "棚卸を終了しますか？"}
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              対象：
              <span className="font-bold text-slate-900">
                {confirm.session.title}
              </span>
              <br />
              {confirm.action === "PAUSE"
                ? "保存済みの棚卸入力は残ります。担当者は再開するまで入力できません。"
                : confirm.action === "RESUME"
                  ? "担当者は棚卸作業を続行できるようになります。"
                  : "保存済みの入力だけを在庫へ反映します。未棚卸の商品は変更されません。"}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="min-h-12 rounded-xl bg-slate-100 font-bold text-slate-700 hover:bg-slate-200"
              >
                戻る
              </button>

              <button
                type="button"
                onClick={() =>
                  void runAction(confirm.session, confirm.action)
                }
                className={`min-h-12 rounded-xl font-bold text-white ${
                  confirm.action === "PAUSE"
                    ? "bg-amber-500 hover:bg-amber-600"
                    : confirm.action === "RESUME"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                実行する
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
