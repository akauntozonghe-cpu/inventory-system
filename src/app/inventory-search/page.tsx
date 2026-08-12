"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SearchItem = {
  id: string;
  name: string;
  janCode: string | null;
  systemBarcode: string | null;
  managementCode: string | null;
  managementGroupCode: string | null;
  manufacturer: string | null;
  majorCategory: string | null;
  minorCategory: string | null;
  defaultUnit: string | null;
  totalQuantity: number;
  inventoryCount: number;
  locations: Array<{
    name: string;
    quantity: number;
  }>;
};

type StockFilter = "ALL" | "IN_STOCK" | "OUT_OF_STOCK";

function getMessage(data: unknown, fallback: string) {
  if (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return fallback;
}

export default function InventorySearchPage() {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          `/api/items/search?q=${encodeURIComponent(keyword)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const text = await response.text();
        const data: unknown = text ? JSON.parse(text) : null;

        if (!response.ok || !Array.isArray(data)) {
          throw new Error(
            getMessage(data, "商品検索に失敗しました。")
          );
        }

        setItems(data as SearchItem[]);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "商品検索に失敗しました。"
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [keyword]);

  const displayedItems = useMemo(() => {
    if (stockFilter === "IN_STOCK") {
      return items.filter((item) => item.totalQuantity > 0);
    }

    if (stockFilter === "OUT_OF_STOCK") {
      return items.filter((item) => item.totalQuantity <= 0);
    }

    return items;
  }, [items, stockFilter]);

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 text-white">
          <p className="text-sm font-bold text-blue-300">Inventory OS</p>

          <h1 className="mt-1 text-3xl font-black sm:text-4xl">
            在庫検索
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            JAN・システムバーコード・商品名・メーカー・分類・保管場所から検索できます。
          </p>
        </header>

        <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
          <label className="block">
            <span className="sr-only">商品を検索</span>

            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="JAN・商品名・メーカー・分類・保管場所で検索"
              className="w-full rounded-2xl border-2 border-slate-200 px-4 py-4 text-base outline-none transition focus:border-blue-600 sm:text-lg"
              autoFocus
            />
          </label>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {[
              ["ALL", "すべて"],
              ["IN_STOCK", "在庫あり"],
              ["OUT_OF_STOCK", "在庫なし"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStockFilter(value as StockFilter)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
                  stockFilter === value
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <div className="mt-5 flex items-center justify-between gap-4 px-1 text-sm text-slate-300">
          <p>
            {loading
              ? "検索中…"
              : `${displayedItems.length}件の商品が見つかりました`}
          </p>

          {keyword && (
            <button
              type="button"
              onClick={() => setKeyword("")}
              className="font-bold text-blue-300"
            >
              検索をクリア
            </button>
          )}
        </div>

        {errorMessage && (
          <section className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700">
            {errorMessage}
          </section>
        )}

        {!loading && !errorMessage && displayedItems.length === 0 && (
          <section className="mt-5 rounded-3xl bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-black text-slate-900">
              商品が見つかりません
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              商品名の一部、JAN、メーカー名、分類、保管場所で検索してください。
            </p>
          </section>
        )}

        <section className="mt-5 grid gap-4 lg:grid-cols-2">
          {displayedItems.map((item) => {
            const unit = item.defaultUnit || "個";
            const category = [item.majorCategory, item.minorCategory]
              .filter(Boolean)
              .join(" / ");

            return (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="block rounded-3xl bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-xl font-black text-slate-950">
                      {item.name}
                    </h2>

                    <p className="mt-2 break-all text-sm text-slate-600">
                      JAN：{item.janCode ?? "-"}
                    </p>

                    {item.systemBarcode && (
                      <p className="mt-1 break-all text-sm text-violet-700">
                        システムバーコード：{item.systemBarcode}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 rounded-2xl bg-blue-50 px-3 py-2 text-right">
                    <p className="text-xs font-bold text-blue-700">総在庫</p>
                    <p className="mt-1 text-2xl font-black text-blue-700">
                      {item.totalQuantity}
                      <span className="ml-1 text-sm">{unit}</span>
                    </p>
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                  <div>
                    <dt className="text-slate-500">メーカー</dt>
                    <dd className="mt-1 font-bold text-slate-800">
                      {item.manufacturer || "-"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">分類</dt>
                    <dd className="mt-1 break-words font-bold text-slate-800">
                      {category || "-"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">管理コード</dt>
                    <dd className="mt-1 break-all font-bold text-slate-800">
                      {item.managementCode || "-"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">在庫登録数</dt>
                    <dd className="mt-1 font-bold text-slate-800">
                      {item.inventoryCount}件
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-500">
                    保管場所ごとの在庫
                  </p>

                  {item.locations.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">
                      在庫の登録はありません
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.locations.map((location) => (
                        <span
                          key={location.name}
                          className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700"
                        >
                          {location.name}：{location.quantity}
                          {unit}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <p className="mt-4 text-right text-sm font-bold text-blue-600">
                  商品詳細を見る →
                </p>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}