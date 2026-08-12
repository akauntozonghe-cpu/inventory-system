"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Scope =
  | "ALL"
  | "LOCATION"
  | "MAJOR_CATEGORY"
  | "MINOR_CATEGORY";

type Options = {
  locations: Array<{
    id: string;
    name: string;
  }>;
  majorCategories: string[];
  minorCategories: string[];
};

type SessionStatus =
  | "IN_PROGRESS"
  | "PAUSED"
  | "REVIEW"
  | "CONFLICT"
  | "COMPLETED"
  | "CANCELLED";

type Session = {
  id: string;
  title: string;
  scopeLabel: string | null;
  status: SessionStatus;
  targetCount: number;
  recordedCount: number;
};

type CurrentUser = {
  displayName: string;
};

const scopeLabels: Record<Scope, string> = {
  ALL: "全在庫",
  LOCATION: "保管場所ごと",
  MAJOR_CATEGORY: "大分類ごと",
  MINOR_CATEGORY: "小分類ごと",
};

function getMessage(value: unknown, fallback: string) {
  if (
    typeof value === "object" &&
    value !== null &&
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
    throw new Error(
      `サーバーから応答がありません。HTTP ${response.status}`
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `正しい応答を取得できませんでした。HTTP ${response.status}`
    );
  }
}

function isOptions(value: unknown): value is Options {
  return (
    typeof value === "object" &&
    value !== null &&
    "locations" in value &&
    "majorCategories" in value &&
    "minorCategories" in value &&
    Array.isArray(value.locations) &&
    Array.isArray(value.majorCategories) &&
    Array.isArray(value.minorCategories)
  );
}

function isSessions(value: unknown): value is Session[] {
  return Array.isArray(value);
}

function isCurrentUser(value: unknown): value is CurrentUser {
  return (
    typeof value === "object" &&
    value !== null &&
    "displayName" in value &&
    typeof value.displayName === "string"
  );
}

function getSessionLabel(status: SessionStatus) {
  switch (status) {
    case "PAUSED":
      return "中断中の棚卸";
    case "IN_PROGRESS":
      return "作業中の棚卸";
    case "REVIEW":
      return "確認待ちの棚卸";
    case "CONFLICT":
      return "競合停止中の棚卸";
    case "CANCELLED":
      return "安全終了した棚卸";
    case "COMPLETED":
      return "終了済みの棚卸";
  }
}

export default function StocktakeStartPage() {
  const router = useRouter();

  const [options, setOptions] = useState<Options>({
    locations: [],
    majorCategories: [],
    minorCategories: [],
  });

  const [sessions, setSessions] = useState<Session[]>([]);
  const [operator, setOperator] = useState("");
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [scopeType, setScopeType] = useState<Scope>("ALL");
  const [scopeValue, setScopeValue] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [
          meResponse,
          optionsResponse,
          sessionsResponse,
        ] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/stocktake/options", {
            cache: "no-store",
          }),
          fetch("/api/stocktake/session?active=true", {
            cache: "no-store",
          }),
        ]);

        const [me, optionsData, sessionsData] =
          await Promise.all([
            readJson(meResponse),
            readJson(optionsResponse),
            readJson(sessionsResponse),
          ]);

        if (meResponse.status === 401) {
          router.replace("/login");
          return;
        }

        if (!meResponse.ok || !isCurrentUser(me)) {
          throw new Error(
            getMessage(
              me,
              `AUTH_ME_${meResponse.status}: ログイン情報を確認できませんでした。`
            )
          );
        }

        if (!optionsResponse.ok || !isOptions(optionsData)) {
          throw new Error(
            getMessage(
              optionsData,
              `STOCKTAKE_OPTIONS_${optionsResponse.status}: 棚卸候補を取得できませんでした。`
            )
          );
        }

        if (!sessionsResponse.ok || !isSessions(sessionsData)) {
          throw new Error(
            getMessage(
              sessionsData,
              `STOCKTAKE_SESSIONS_${sessionsResponse.status}: 棚卸一覧を取得できませんでした。`
            )
          );
        }

        if (!cancelled) {
          setOperator(me.displayName);
          setOptions(optionsData);
          setSessions(sessionsData);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "STOCKTAKE_START_UNKNOWN: 初期情報を取得できませんでした。"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const values = useMemo(() => {
    if (scopeType === "LOCATION") {
      return options.locations.map((item) => ({
        value: item.id,
        label: item.name,
      }));
    }

    if (scopeType === "MAJOR_CATEGORY") {
      return options.majorCategories.map((value) => ({
        value,
        label: value,
      }));
    }

    if (scopeType === "MINOR_CATEGORY") {
      return options.minorCategories.map((value) => ({
        value,
        label: value,
      }));
    }

    return [];
  }, [options, scopeType]);

  const activeSession = sessions[0];

  const start = async () => {
    if (!title.trim()) {
      setMessage(
        "STOCKTAKE_TITLE_REQUIRED: 棚卸名を入力してください。"
      );
      return;
    }

    if (!operator.trim()) {
      setMessage(
        "STOCKTAKE_OPERATOR_REQUIRED: 担当者名を入力してください。"
      );
      return;
    }

    if (scopeType !== "ALL" && !scopeValue) {
      setMessage(
        "STOCKTAKE_SCOPE_REQUIRED: 棚卸範囲を選択してください。"
      );
      return;
    }

    setSaving(true);
    setMessage("");

    const scopeLabel =
      scopeType === "ALL"
        ? "全在庫"
        : values.find((item) => item.value === scopeValue)
            ?.label ?? "";

    try {
      const response = await fetch("/api/stocktake/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          operator: operator.trim(),
          memo: memo.trim(),
          scopeType,
          scopeValue,
          scopeLabel,
        }),
      });

      const data = await readJson(response);

      if (
        !response.ok ||
        typeof data !== "object" ||
        data === null ||
        !("id" in data) ||
        typeof data.id !== "string"
      ) {
        throw new Error(
          getMessage(
            data,
            "STOCKTAKE_START_FAILED: 棚卸を開始できませんでした。"
          )
        );
      }

      router.push(`/stocktake/${data.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "STOCKTAKE_START_FAILED: 棚卸を開始できませんでした。"
      );
    } finally {
      setSaving(false);
    }
  };

  const openActiveSession = async () => {
    if (!activeSession || saving) {
      return;
    }

    if (
      activeSession.status === "REVIEW" ||
      activeSession.status === "CONFLICT"
    ) {
      router.push(`/stocktake/${activeSession.id}/result`);
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      if (activeSession.status === "PAUSED") {
        const response = await fetch(
          `/api/stocktake/session/${activeSession.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "RESUME",
            }),
          }
        );

        const data = await readJson(response);

        if (!response.ok) {
          throw new Error(
            getMessage(
              data,
              "STOCKTAKE_RESUME_FAILED: 棚卸を再開できませんでした。"
            )
          );
        }
      }

      router.push(`/stocktake/${activeSession.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "STOCKTAKE_RESUME_FAILED: 棚卸を再開できませんでした。"
      );
    } finally {
      setSaving(false);
    }
  };

  const activeActionLabel =
    activeSession?.status === "PAUSED"
      ? "再開して作業へ"
      : activeSession?.status === "IN_PROGRESS"
        ? "棚卸作業を開く"
        : activeSession?.status === "CONFLICT"
          ? "競合内容を確認する"
          : "結果を確認する";

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <p className="font-bold text-slate-600">
          棚卸情報を読み込んでいます…
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black">
              棚卸開始
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              ログイン中：
              <span className="ml-1 font-bold text-slate-900">
                {operator || "読み込み中…"}
              </span>
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

        {message && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-800"
          >
            {message}
          </p>
        )}

        {activeSession ? (
          <section
            className={`rounded-2xl bg-white p-6 shadow-sm ${
              activeSession.status === "CONFLICT"
                ? "border-2 border-red-300"
                : "border border-orange-200"
            }`}
          >
            <p
              className={`text-sm font-bold ${
                activeSession.status === "CONFLICT"
                  ? "text-red-700"
                  : "text-orange-700"
              }`}
            >
              {getSessionLabel(activeSession.status)}
            </p>

            <h2 className="mt-1 text-2xl font-black">
              {activeSession.title}
            </h2>

            <p className="mt-3 text-slate-600">
              対象：
              {activeSession.scopeLabel ?? "全在庫"}
              <br />
              進捗：
              {activeSession.recordedCount} /{" "}
              {activeSession.targetCount}件
            </p>

            {activeSession.status === "CONFLICT" && (
              <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">
                棚卸開始後に在庫数の変更を検知しました。
                誤反映を防ぐため作業を停止しています。
                結果画面から管理者が安全終了または内容確認を行えます。
              </p>
            )}

            {activeSession.status === "REVIEW" && (
              <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                旧バージョンで確認待ちになっている棚卸です。
                結果画面から内容を確認してください。
              </p>
            )}

            <button
              type="button"
              onClick={() => void openActiveSession()}
              disabled={saving}
              className={`mt-5 w-full rounded-xl py-3.5 text-lg font-bold text-white disabled:bg-slate-400 ${
                activeSession.status === "CONFLICT"
                  ? "bg-red-600"
                  : "bg-blue-600"
              }`}
            >
              {saving ? "処理中…" : activeActionLabel}
            </button>
          </section>
        ) : (
          <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-black">
              新しい棚卸を開始
            </h2>

            <div className="mt-6 space-y-5">
              <label className="block font-bold">
                棚卸名
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:border-blue-500"
                  placeholder="例：2026年8月 倉庫棚卸"
                />
              </label>

              <label className="block font-bold">
                担当者
                <input
                  value={operator}
                  onChange={(event) =>
                    setOperator(event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:border-blue-500"
                />

                <span className="mt-1 block text-xs font-normal text-slate-500">
                  ログイン中の表示名を自動入力しています。
                  必要な場合のみ変更できます。
                </span>
              </label>

              <div>
                <p className="font-bold">棚卸範囲</p>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(Object.keys(scopeLabels) as Scope[]).map(
                    (scope) => (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => {
                          setScopeType(scope);
                          setScopeValue("");
                        }}
                        className={`rounded-xl border p-3 text-left font-bold ${
                          scopeType === scope
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        {scopeLabels[scope]}
                      </button>
                    )
                  )}
                </div>
              </div>

              {scopeType !== "ALL" && (
                <label className="block font-bold">
                  {scopeLabels[scopeType]}を選択
                  <select
                    value={scopeValue}
                    onChange={(event) =>
                      setScopeValue(event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:border-blue-500"
                  >
                    <option value="">
                      選択してください
                    </option>

                    {values.map((value) => (
                      <option key={value.value} value={value.value}>
                        {value.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block font-bold">
                メモ
                <textarea
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:border-blue-500"
                  rows={3}
                  placeholder="必要な場合のみ入力"
                />
              </label>

              <button
                type="button"
                onClick={() => void start()}
                disabled={saving || !operator.trim()}
                className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-black text-white transition hover:bg-blue-700 disabled:bg-slate-400"
              >
                {saving ? "開始中…" : "棚卸を開始する"}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}