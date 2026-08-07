"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ScopeType =
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

type ActiveSession = {
  id: string;
  title: string;
  operator: string | null;
  scopeLabel: string | null;
  status: "IN_PROGRESS" | "PAUSED";
  startedAt: string;
  targetCount: number;
  recordedCount: number;
};

const scopeLabels: Record<ScopeType, string> = {
  ALL: "全在庫",
  LOCATION: "保管場所ごと",
  MAJOR_CATEGORY: "大分類ごと",
  MINOR_CATEGORY: "小分類ごと",
};

export default function StocktakeStartPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [activeLoading, setActiveLoading] = useState(true);

  const [options, setOptions] = useState<Options>({
    locations: [],
    majorCategories: [],
    minorCategories: [],
  });

  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>(
    []
  );

  const [form, setForm] = useState({
    title: "",
    operator: "",
    memo: "",
    scopeType: "ALL" as ScopeType,
    scopeValue: "",
  });

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [optionsRes, sessionsRes] = await Promise.all([
          fetch("/api/stocktake/options"),
          fetch("/api/stocktake/session?active=true"),
        ]);

        if (!optionsRes.ok) {
          throw new Error("棚卸対象の選択肢を取得できませんでした");
        }

        const optionsData: Options = await optionsRes.json();
        setOptions(optionsData);

        if (sessionsRes.ok) {
          const sessionsData: ActiveSession[] = await sessionsRes.json();
          setActiveSessions(sessionsData);
        }
      } catch (error) {
        console.error(error);
        alert(
          error instanceof Error
            ? error.message
            : "棚卸開始画面の読み込みに失敗しました"
        );
      } finally {
        setOptionsLoading(false);
        setActiveLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const handleTextChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm((previous) => ({
      ...previous,
      [e.target.name]: e.target.value,
    }));
  };

  const handleScopeTypeChange = (scopeType: ScopeType) => {
    setForm((previous) => ({
      ...previous,
      scopeType,
      scopeValue: "",
    }));
  };

  const selectedScopeLabel = () => {
    if (form.scopeType === "ALL") {
      return "全在庫";
    }

    if (form.scopeType === "LOCATION") {
      return (
        options.locations.find(
          (location) => location.id === form.scopeValue
        )?.name ?? ""
      );
    }

    return form.scopeValue;
  };

  const startStocktake = async () => {
    if (!form.title.trim()) {
      alert("棚卸名を入力してください");
      return;
    }

    if (form.scopeType !== "ALL" && !form.scopeValue) {
      alert("棚卸対象を選択してください");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/stocktake/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          scopeLabel: selectedScopeLabel(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message ?? "棚卸を開始できませんでした");
      }

      router.push(`/stocktake/${data.id}`);
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "棚卸を開始できませんでした"
      );
    } finally {
      setLoading(false);
    }
  };

  const scopeOptions =
    form.scopeType === "LOCATION"
      ? options.locations.map((location) => ({
          value: location.id,
          label: location.name,
        }))
      : form.scopeType === "MAJOR_CATEGORY"
        ? options.majorCategories.map((category) => ({
            value: category,
            label: category,
          }))
        : form.scopeType === "MINOR_CATEGORY"
          ? options.minorCategories.map((category) => ({
              value: category,
              label: category,
            }))
          : [];

  return (
    <main className="mx-auto max-w-4xl p-8 text-white">
      <h1 className="mb-8 text-3xl font-bold">棚卸開始</h1>

      {!activeLoading && activeSessions.length > 0 && (
        <section className="mb-8 rounded-xl bg-white p-6 text-slate-800 shadow">
          <h2 className="text-2xl font-bold text-slate-900">
            再開できる棚卸
          </h2>

          <p className="mt-2 text-slate-600">
            中断中・入力途中の棚卸を選ぶと、続きから作業できます。
          </p>

          <div className="mt-5 space-y-3">
            {activeSessions.map((session) => {
              const progressPercent =
                session.targetCount === 0
                  ? 0
                  : Math.round(
                      (session.recordedCount / session.targetCount) * 100
                    );

              return (
                <div
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold text-slate-900">
                        {session.title}
                      </p>

                      <span
                        className={`rounded-full px-2 py-1 text-xs font-bold ${
                          session.status === "PAUSED"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {session.status === "PAUSED" ? "中断中" : "棚卸中"}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-600">
                      対象：{session.scopeLabel ?? "全在庫"}　担当者：
                      {session.operator ?? "管理者"}
                    </p>

                    <p className="mt-1 text-sm text-slate-600">
                      進捗：{session.recordedCount} / {session.targetCount} 件
                      （{progressPercent}%）
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/stocktake/${session.id}`)
                    }
                    className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700"
                  >
                    {session.status === "PAUSED" ? "再開する" : "開く"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-xl bg-white p-8 text-slate-800 shadow">
        <h2 className="text-2xl font-bold text-slate-900">
          新しい棚卸を開始
        </h2>

        <div className="mt-6 space-y-6">
          <div>
            <label className="font-semibold" htmlFor="title">
              棚卸名
            </label>

            <input
              id="title"
              className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
              name="title"
              value={form.title}
              onChange={handleTextChange}
              placeholder="例：2026年8月 倉庫棚卸"
            />
          </div>

          <div>
            <label className="font-semibold" htmlFor="operator">
              担当者
            </label>

            <input
              id="operator"
              className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
              name="operator"
              value={form.operator}
              onChange={handleTextChange}
              placeholder="山田 太郎"
            />
          </div>

          <div>
            <p className="font-semibold">棚卸範囲</p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(Object.keys(scopeLabels) as ScopeType[]).map(
                (scopeType) => (
                  <button
                    key={scopeType}
                    type="button"
                    onClick={() => handleScopeTypeChange(scopeType)}
                    className={`rounded-lg border p-4 text-left font-semibold transition ${
                      form.scopeType === scopeType
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {scopeLabels[scopeType]}
                  </button>
                )
              )}
            </div>
          </div>

          {form.scopeType !== "ALL" && (
            <div>
              <label className="font-semibold" htmlFor="scopeValue">
                {scopeLabels[form.scopeType]}を選択
              </label>

              <select
                id="scopeValue"
                className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
                value={form.scopeValue}
                onChange={(e) =>
                  setForm((previous) => ({
                    ...previous,
                    scopeValue: e.target.value,
                  }))
                }
                disabled={optionsLoading}
              >
                <option value="">
                  {optionsLoading ? "読み込み中..." : "選択してください"}
                </option>

                {scopeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="font-semibold" htmlFor="memo">
              メモ
            </label>

            <textarea
              id="memo"
              className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-slate-900"
              rows={4}
              name="memo"
              value={form.memo}
              onChange={handleTextChange}
              placeholder="必要であれば入力"
            />
          </div>

          <button
            type="button"
            onClick={startStocktake}
            disabled={loading || optionsLoading}
            className="w-full rounded-xl bg-blue-600 py-4 text-lg font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "開始中..." : "棚卸を開始する"}
          </button>
        </div>
      </section>
    </main>
  );
}