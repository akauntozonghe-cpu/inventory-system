"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ScopeType = "ALL" | "LOCATION" | "MAJOR_CATEGORY" | "MINOR_CATEGORY";

type SessionStatus =
  | "IN_PROGRESS"
  | "PAUSED"
  | "REVIEW"
  | "CONFLICT"
  | "COMPLETED"
  | "CANCELLED";

type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
};

type StocktakeSession = {
  id: string;
  title: string;
  operator: string | null;
  operatorUserName: string | null;
  scopeType: ScopeType;
  scopeValue: string | null;
  scopeLabel: string;
  status: SessionStatus;
  statusLabel: string;
  targetCount: number;
  recordedCount: number;
  unrecordedCount: number;
  progressPercent: number;
  updatedAt: string;
  canOpen: boolean;
  canResume: boolean;
  isAdminView: boolean;
};

type OptionData = {
  storageLocations: string[];
  majorCategories: string[];
  minorCategories: string[];
};

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

function getStringArray(
  value: Record<string, unknown>,
  key: string
): string[] {
  const target = value[key];

  return Array.isArray(target)
    ? target.filter((item): item is string => typeof item === "string")
    : [];
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getScopeLabel(scopeType: ScopeType) {
  switch (scopeType) {
    case "ALL":
      return "全在庫";
    case "LOCATION":
      return "保管場所ごと";
    case "MAJOR_CATEGORY":
      return "大分類ごと";
    case "MINOR_CATEGORY":
      return "小分類ごと";
  }
}

function getStatusClass(status: SessionStatus) {
  switch (status) {
    case "PAUSED":
      return "bg-orange-100 text-orange-700";
    case "REVIEW":
      return "bg-indigo-100 text-indigo-700";
    case "CONFLICT":
      return "bg-red-100 text-red-700";
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-700";
    default:
      return "bg-blue-100 text-blue-700";
  }
}

export default function StocktakeStartPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [sessions, setSessions] = useState<StocktakeSession[]>([]);
  const [options, setOptions] = useState<OptionData>({
    storageLocations: [],
    majorCategories: [],
    minorCategories: [],
  });

  const [title, setTitle] = useState("");
  const [operator, setOperator] = useState("");
  const [memo, setMemo] = useState("");
  const [scopeType, setScopeType] = useState<ScopeType>("ALL");
  const [scopeValue, setScopeValue] = useState("");

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadPageData = useCallback(async () => {
    const [userResponse, sessionResponse, optionsResponse] =
      await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/stocktake/session", { cache: "no-store" }),
        fetch("/api/stocktake/options", { cache: "no-store" }),
      ]);

    const userData: unknown = await userResponse.json().catch(() => null);
    const sessionData: unknown = await sessionResponse.json().catch(() => null);
    const optionsData: unknown = await optionsResponse.json().catch(() => null);

    if (!userResponse.ok) {
      throw new Error(
        getMessage(userData, "ログイン情報を取得できませんでした。")
      );
    }

    if (!sessionResponse.ok) {
      throw new Error(
        getMessage(sessionData, "棚卸一覧を取得できませんでした。")
      );
    }

    if (!optionsResponse.ok) {
      throw new Error(
        getMessage(optionsData, "棚卸の選択肢を取得できませんでした。")
      );
    }

    const user =
      userData &&
      typeof userData === "object" &&
      "user" in userData &&
      userData.user &&
      typeof userData.user === "object"
        ? (userData.user as CurrentUser)
        : null;

    if (!user) {
      throw new Error(
        "ログイン情報が不完全です。もう一度ログインしてください。"
      );
    }

    const sessionList =
      sessionData &&
      typeof sessionData === "object" &&
      "sessions" in sessionData &&
      Array.isArray(sessionData.sessions)
        ? (sessionData.sessions as StocktakeSession[])
        : [];

    const rawOptions =
      optionsData && typeof optionsData === "object"
        ? (optionsData as Record<string, unknown>)
        : {};

    setCurrentUser(user);
    setSessions(sessionList);

    setOptions({
      storageLocations: getStringArray(rawOptions, "storageLocations"),
      majorCategories: getStringArray(rawOptions, "majorCategories"),
      minorCategories: getStringArray(rawOptions, "minorCategories"),
    });

    setOperator((previous) => previous || user.displayName);
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        await loadPageData();
      } catch (loadError) {
        if (mounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "棚卸開始画面を読み込めませんでした。"
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [loadPageData]);

  const startStocktake = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!title.trim()) {
      setError("棚卸名を入力してください。");
      return;
    }

    if (scopeType !== "ALL" && !scopeValue.trim()) {
      setError(`${getScopeLabel(scopeType)}を選択してください。`);
      return;
    }

    setStarting(true);
    setError("");

    try {
      const response = await fetch("/api/stocktake/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          operator: operator.trim() || currentUser?.displayName || "管理者",
          memo: memo.trim() || null,
          scopeType,
          scopeValue: scopeType === "ALL" ? null : scopeValue.trim(),
        }),
      });

      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getMessage(data, "棚卸を開始できませんでした。")
        );
      }

      const sessionId =
        data &&
        typeof data === "object" &&
        "id" in data &&
        typeof data.id === "string"
          ? data.id
          : data &&
              typeof data === "object" &&
              "session" in data &&
              data.session &&
              typeof data.session === "object" &&
              "id" in data.session &&
              typeof data.session.id === "string"
            ? data.session.id
            : "";

      if (!sessionId) {
        throw new Error("開始した棚卸情報を取得できませんでした。");
      }

      router.push(`/stocktake/${sessionId}`);
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "棚卸を開始できませんでした。"
      );
    } finally {
      setStarting(false);
    }
  };

  const resumeStocktake = async (session: StocktakeSession) => {
    setResumingId(session.id);
    setError("");

    try {
      if (session.status === "PAUSED") {
        const response = await fetch(`/api/stocktake/session/${session.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "RESUME",
          }),
        });

        const data: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            getMessage(data, "棚卸を再開できませんでした。")
          );
        }
      }

      router.push(`/stocktake/${session.id}`);
    } catch (resumeError) {
      setError(
        resumeError instanceof Error
          ? resumeError.message
          : "棚卸を開けませんでした。"
      );
    } finally {
      setResumingId(null);
    }
  };

  const scopeOptions =
    scopeType === "LOCATION"
      ? options.storageLocations
      : scopeType === "MAJOR_CATEGORY"
        ? options.majorCategories
        : scopeType === "MINOR_CATEGORY"
          ? options.minorCategories
          : [];

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-5 text-white sm:p-8">
        <div className="mx-auto max-w-5xl rounded-3xl bg-white p-8 text-slate-900">
          棚卸開始画面を読み込んでいます…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 pb-12 text-slate-950">
      <header className="border-b border-slate-800 bg-slate-950 px-5 py-6 text-white sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold text-indigo-300">棚卸管理</p>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">棚卸開始</h1>
            <p className="mt-2 text-slate-300">
              ログイン中：{currentUser?.displayName || "-"}
            </p>
          </div>

          <Link
            href="/"
            className="rounded-xl bg-slate-700 px-5 py-3 text-center font-bold text-white transition hover:bg-slate-600"
          >
            ホームへ戻る
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-7 p-5 sm:p-8">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-bold text-red-800">
            {error}
          </div>
        )}

        {sessions.length > 0 && (
          <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <p className="text-sm font-bold text-indigo-600">
              再開・確認できる棚卸
            </p>
            <h2 className="mt-1 text-2xl font-black">作業中の棚卸</h2>
            <p className="mt-2 text-slate-600">
              中断した棚卸は再開できます。確認待ち・競合中の棚卸は結果を確認してください。
            </p>

            <div className="mt-6 space-y-3">
              {sessions.map((session) => (
                <article
                  key={session.id}
                  className="rounded-2xl border border-slate-200 p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-black">{session.title}</h3>
                        <span
                          className={`rounded-full px-3 py-1 text-sm font-black ${getStatusClass(
                            session.status
                          )}`}
                        >
                          {session.statusLabel}
                        </span>
                      </div>

                      <p className="mt-2 text-slate-600">
                        対象：{session.scopeLabel}
                        {session.operatorUserName
                          ? `　担当者：${session.operatorUserName}`
                          : session.operator
                            ? `　担当者：${session.operator}`
                            : ""}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        進捗：{session.recordedCount} / {session.targetCount} 件
                        （{session.progressPercent}%）　更新：
                        {formatDate(session.updatedAt)}
                      </p>
                    </div>

                    {session.status === "REVIEW" ||
                    session.status === "CONFLICT" ? (
                      <Link
                        href={`/stocktake/${session.id}/result`}
                        className="rounded-xl bg-indigo-600 px-5 py-3 text-center font-black text-white transition hover:bg-indigo-500"
                      >
                        結果を確認する
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void resumeStocktake(session)}
                        disabled={!session.canOpen || resumingId === session.id}
                        className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {resumingId === session.id
                          ? "開いています…"
                          : session.status === "PAUSED"
                            ? "再開する"
                            : "開く"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
          <p className="text-sm font-bold text-indigo-600">新しい棚卸</p>
          <h2 className="mt-1 text-2xl font-black">棚卸を開始する</h2>

          <form className="mt-6 space-y-6" onSubmit={startStocktake}>
            <div>
              <label className="block font-bold" htmlFor="stocktake-title">
                棚卸名
              </label>
              <input
                id="stocktake-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例：2026年8月 倉庫棚卸"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold" htmlFor="stocktake-operator">
                担当者
              </label>
              <input
                id="stocktake-operator"
                value={operator}
                onChange={(event) => setOperator(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500"
              />
              <p className="mt-2 text-sm text-slate-500">
                ログイン中のユーザー名を自動入力しています。実作業者が違う場合のみ変更してください。
              </p>
            </div>

            <div>
              <p className="font-bold">棚卸範囲</p>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    ["ALL", "全在庫"],
                    ["LOCATION", "保管場所ごと"],
                    ["MAJOR_CATEGORY", "大分類ごと"],
                    ["MINOR_CATEGORY", "小分類ごと"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setScopeType(value);
                      setScopeValue("");
                    }}
                    className={`rounded-xl border-2 px-4 py-4 text-left font-black transition ${
                      scopeType === value
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {scopeType !== "ALL" && (
                <div className="mt-4">
                  <label className="block font-bold" htmlFor="scope-value">
                    {getScopeLabel(scopeType)}
                  </label>

                  <select
                    id="scope-value"
                    value={scopeValue}
                    onChange={(event) => setScopeValue(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500"
                  >
                    <option value="">選択してください</option>

                    {scopeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>

                  {scopeOptions.length === 0 && (
                    <p className="mt-2 text-sm text-orange-600">
                      選択肢がありません。在庫データの保管場所または分類を登録してから開始してください。
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block font-bold" htmlFor="stocktake-memo">
                メモ
              </label>
              <textarea
                id="stocktake-memo"
                rows={4}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="必要であれば入力"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={starting}
              className="w-full rounded-xl bg-indigo-600 px-5 py-4 text-lg font-black text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting ? "棚卸を開始しています…" : "棚卸を開始する"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}