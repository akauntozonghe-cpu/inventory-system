"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Scope = "ALL" | "LOCATION" | "MAJOR_CATEGORY" | "MINOR_CATEGORY";

type Options = {
  locations: Array<{ id: string; name: string }>;
  majorCategories: string[];
  minorCategories: string[];
};

type Session = {
  id: string;
  title: string;
  scopeLabel: string | null;
  status: "IN_PROGRESS" | "PAUSED";
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

  useEffect(() => {
    const load = async () => {
      try {
        const [meResponse, optionsResponse, sessionsResponse] =
          await Promise.all([
            fetch("/api/auth/me"),
            fetch("/api/stocktake/options"),
            fetch("/api/stocktake/session?active=true"),
          ]);

        if (meResponse.status === 401) {
          router.replace("/login");
          return;
        }

        if (!meResponse.ok) {
          throw new Error(
            `AUTH_ME_${meResponse.status}: ログイン情報を取得できませんでした。`
          );
        }

        if (!optionsResponse.ok) {
          throw new Error(
            `STOCKTAKE_OPTIONS_${optionsResponse.status}: 棚卸範囲を取得できませんでした。`
          );
        }

        if (!sessionsResponse.ok) {
          throw new Error(
            `STOCKTAKE_SESSIONS_${sessionsResponse.status}: 中断中の棚卸を取得できませんでした。`
          );
        }

        const me = (await meResponse.json()) as CurrentUser;

        setOperator(me.displayName);
        setOptions(await optionsResponse.json());
        setSessions(await sessionsResponse.json());
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "STOCKTAKE_START_UNKNOWN: 必要な情報を取得できませんでした。"
        );
      }
    };

    void load();
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

  const ownActiveSession = sessions[0];

  const start = async () => {
    if (!title.trim()) {
      setMessage("STOCKTAKE_TITLE_REQUIRED: 棚卸名を入力してください。");
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
        : values.find((item) => item.value === scopeValue)?.label ?? "";

    try {
      const response = await fetch("/api/stocktake/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          operator,
          memo,
          scopeType,
          scopeValue,
          scopeLabel,
        }),
      });

      const data = (await response.json()) as {
        id?: string;
        code?: string;
        message?: string;
      };

      if (!response.ok || !data.id) {
        throw new Error(
          `${data.code ?? "STOCKTAKE_START_FAILED"}: ${
            data.message ?? "棚卸を開始できませんでした。"
          }`
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

  const resume = async () => {
    if (!ownActiveSession) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      if (ownActiveSession.status === "PAUSED") {
        const response = await fetch(
          `/api/stocktake/session/${ownActiveSession.id}`,
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

        const data = (await response.json()) as {
          code?: string;
          message?: string;
        };

        if (!response.ok) {
          throw new Error(
            `${data.code ?? "STOCKTAKE_RESUME_FAILED"}: ${
              data.message ?? "棚卸を再開できませんでした。"
            }`
          );
        }
      }

      router.push(`/stocktake/${ownActiveSession.id}`);
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

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black">棚卸開始</h1>
            <p className="mt-2 text-sm text-slate-600">
              ログイン実施者：
              <span className="ml-1 font-bold text-slate-900">
                {operator || "読み込み中..."}
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

        {ownActiveSession ? (
          <section className="rounded-2xl border border-orange-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-bold text-orange-700">
              {ownActiveSession.status === "PAUSED"
                ? "中断中の棚卸"
                : "作業中の棚卸"}
            </p>

            <h2 className="mt-1 text-2xl font-black">
              {ownActiveSession.title}
            </h2>

            <p className="mt-3 text-slate-600">
              対象：{ownActiveSession.scopeLabel ?? "全在庫"}
              <br />
              進捗：{ownActiveSession.recordedCount} /{" "}
              {ownActiveSession.targetCount} 件
            </p>

            <button
              type="button"
              onClick={() => void resume()}
              disabled={saving}
              className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 text-lg font-bold text-white disabled:bg-slate-400"
            >
              {saving
                ? "処理中..."
                : ownActiveSession.status === "PAUSED"
                  ? "再開して作業へ"
                  : "棚卸画面を開く"}
            </button>
          </section>
        ) : (
          <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-black">新しい棚卸を開始</h2>

            <div className="mt-6 space-y-5">
              <label className="block font-bold">
                棚卸名
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
                  placeholder="例：2026年8月 倉庫棚卸"
                />
              </label>

              <label className="block font-bold">
                担当者名
                <input
                  value={operator}
                  onChange={(event) => setOperator(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  ログインした実施者名を自動入力しています。必要なら担当者名だけ変更できます。
                </span>
              </label>

              <div>
                <p className="font-bold">棚卸範囲</p>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(Object.keys(scopeLabels) as Scope[]).map((scope) => (
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
                  ))}
                </div>
              </div>

              {scopeType !== "ALL" && (
                <label className="block font-bold">
                  {scopeLabels[scopeType]}を選択
                  <select
                    value={scopeValue}
                    onChange={(event) => setScopeValue(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
                  >
                    <option value="">選択してください</option>

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
                  className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
                  rows={3}
                  placeholder="必要な場合のみ入力"
                />
              </label>

              <button
                type="button"
                onClick={() => void start()}
                disabled={saving || !operator}
                className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-black text-white transition hover:bg-blue-700 disabled:bg-slate-400"
              >
                {saving ? "開始中..." : "棚卸を開始する"}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}