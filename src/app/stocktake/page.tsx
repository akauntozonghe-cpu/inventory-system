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

  const [options, setOptions] = useState<Options>({
    locations: [],
    majorCategories: [],
    minorCategories: [],
  });

  const [form, setForm] = useState({
    title: "",
    operator: "",
    memo: "",
    scopeType: "ALL" as ScopeType,
    scopeValue: "",
  });

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch("/api/stocktake/options");

        if (!res.ok) {
          throw new Error("選択肢を取得できませんでした");
        }

        const data: Options = await res.json();
        setOptions(data);
      } catch (error) {
        console.error(error);
        alert("棚卸対象の選択肢を取得できませんでした");
      } finally {
        setOptionsLoading(false);
      }
    };

    fetchOptions();
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

  const targetOptions =
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
    <main className="mx-auto max-w-3xl p-8 text-white">
      <h1 className="mb-8 text-3xl font-bold">棚卸開始</h1>

      <div className="space-y-6 rounded-xl bg-white p-8 text-slate-800 shadow">
        <div>
          <label className="font-semibold" htmlFor="title">
            棚卸名
          </label>

          <input
            id="title"
            className="mt-2 w-full rounded-lg border p-3 text-slate-900"
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
            className="mt-2 w-full rounded-lg border p-3 text-slate-900"
            name="operator"
            value={form.operator}
            onChange={handleTextChange}
            placeholder="山田 太郎"
          />
        </div>

        <div>
          <div className="font-semibold">棚卸対象</div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(Object.keys(scopeLabels) as ScopeType[]).map((scopeType) => (
              <button
                key={scopeType}
                type="button"
                onClick={() => handleScopeTypeChange(scopeType)}
                className={`rounded-lg border p-3 text-left font-semibold ${
                  form.scopeType === scopeType
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {scopeLabels[scopeType]}
              </button>
            ))}
          </div>
        </div>

        {form.scopeType !== "ALL" && (
          <div>
            <label className="font-semibold" htmlFor="scopeValue">
              {scopeLabels[form.scopeType]}を選択
            </label>

            <select
              id="scopeValue"
              className="mt-2 w-full rounded-lg border p-3 text-slate-900"
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

              {targetOptions.map((option) => (
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
            className="mt-2 w-full rounded-lg border p-3 text-slate-900"
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
    </main>
  );
}