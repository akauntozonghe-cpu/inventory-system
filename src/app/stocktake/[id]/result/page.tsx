"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type Mode = "ALL" | "DIFFERENCE" | "UNRECORDED";

type ResultItem = {
  id: string;
  name: string;
  janCode: string | null;
  location: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  difference: number | null;
};

type ResultData = {
  session: {
    id: string;
    title: string;
    status: "IN_PROGRESS" | "PAUSED" | "COMPLETED";
  };
  summary: {
    targetCount: number;
    recordedCount: number;
    matchedCount: number;
    differenceCount: number;
    unrecordedCount: number;
  };
  items: ResultItem[];
};

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

function isResultData(value: unknown): value is ResultData {
  return (
    typeof value === "object" &&
    value !== null &&
    "session" in value &&
    "summary" in value &&
    "items" in value &&
    Array.isArray(value.items)
  );
}

export default function StocktakeResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<ResultData | null>(null);
  const [mode, setMode] = useState<Mode>("DIFFERENCE");

  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");
  const [completedMessage, setCompletedMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/stocktake/session/${encodeURIComponent(id)}/result`,
          {
            cache: "no-store",
          }
        );

        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(
            getMessage(payload, "棚卸結果を取得できませんでした。")
          );
        }

        if (!isResultData(payload)) {
          throw new Error("棚卸結果の形式が正しくありません。");
        }

        setData(payload);
      } catch (caughtError) {
        console.error(caughtError);

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "棚卸結果を取得できませんでした。"
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id]);

  const applyStocktake = async () => {
    if (!data || data.session.status === "COMPLETED") {
      return;
    }

    setShowConfirm(false);
    setFinishing(true);
    setError("");

    try {
      const response = await fetch(
        `/api/stocktake/session/${encodeURIComponent(id)}/apply`,
        {
          method: "POST",
        }
      );

      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getMessage(payload, "棚卸データを正式反映できませんでした。")
        );
      }

      setCompletedMessage(
        "棚卸データを正式在庫へ反映しました。まもなく開始画面へ戻ります。"
      );

      setData((previous) =>
        previous
          ? {
              ...previous,
              session: {
                ...previous.session,
                status: "COMPLETED",
              },
            }
          : previous
      );

      window.setTimeout(() => {
        router.replace("/stocktake/start");
      }, 2500);
    } catch (caughtError) {
      console.error(caughtError);

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "棚卸データを正式反映できませんでした。"
      );
    } finally {
      setFinishing(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 text-slate-700">
        棚卸結果を読み込み中...
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
        <div className="mx-auto max-w-xl rounded-3xl bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold">
            棚卸結果を表示できません
          </h1>

          <p className="mt-3 text-sm text-red-600">{error}</p>

          <Link
            href={`/stocktake/${id}`}
            className="mt-5 inline-block rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"
          >
            棚卸入力へ戻る
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return null;
  }

  const isCompleted =
    data.session.status === "COMPLETED" || Boolean(completedMessage);

  const visibleItems = data.items.filter((item) => {
    if (mode === "ALL") {
      return true;
    }

    if (mode === "UNRECORDED") {
      return item.countedQuantity === null;
    }

    return item.difference !== null && item.difference !== 0;
  });

  const filters: Array<[Mode, string]> = [
    ["DIFFERENCE", "差異あり"],
    ["UNRECORDED", "未棚卸"],
    ["ALL", "すべて"],
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              棚卸結果
            </h1>

            <p className="mt-1 text-slate-500">
              {data.session.title}
            </p>

            <p
              className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold ${
                isCompleted
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-orange-100 text-orange-700"
              }`}
            >
              {isCompleted ? "正式反映済み" : "最終確認中"}
            </p>
          </div>

          <div className="flex gap-2">
            {isCompleted ? (
              <Link
                href="/stocktake/start"
                className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"
              >
                棚卸開始へ戻る
              </Link>
            ) : (
              <>
                <Link
                  href={`/stocktake/${id}`}
                  className="rounded-xl bg-slate-700 px-4 py-3 font-bold text-white"
                >
                  入力へ戻る
                </Link>

                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  disabled={finishing}
                  className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:bg-slate-400"
                >
                  最終確定
                </button>
              </>
            )}
          </div>
        </header>

        {completedMessage ? (
          <p className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            {completedMessage}
          </p>
        ) : (
          <p className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            内容を確認してください。最終確定を押すと、棚卸済みの商品だけが正式在庫へ反映されます。
            未棚卸の商品は現在の在庫数を変更しません。
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["対象", data.summary.targetCount, "text-slate-900"],
            ["棚卸済", data.summary.recordedCount, "text-blue-600"],
            ["一致", data.summary.matchedCount, "text-emerald-600"],
            ["差異", data.summary.differenceCount, "text-red-600"],
            ["未棚卸", data.summary.unrecordedCount, "text-orange-600"],
          ].map(([label, value, color]) => (
            <div
              key={String(label)}
              className="rounded-2xl bg-white p-4 shadow-sm"
            >
              <p className="text-sm text-slate-500">{label}</p>

              <p className={`mt-1 text-2xl font-bold ${color}`}>
                {value}
              </p>
            </div>
          ))}
        </section>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {filters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`shrink-0 rounded-full px-4 py-2 font-bold ${
                mode === value
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-700 shadow-sm"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="mt-4 overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="divide-y">
            {visibleItems.map((item) => {
              const stateLabel =
                item.countedQuantity === null
                  ? "未棚卸"
                  : item.difference === 0
                    ? "一致"
                    : `差異 ${item.difference && item.difference > 0 ? "+" : ""}${item.difference}`;

              const stateColor =
                item.countedQuantity === null
                  ? "text-orange-600"
                  : item.difference === 0
                    ? "text-emerald-600"
                    : "text-red-600";

              return (
                <article key={item.id} className="p-4 sm:p-5">
                  <div className="flex justify-between gap-3">
                    <h2 className="font-bold">{item.name}</h2>

                    <span className={`shrink-0 font-bold ${stateColor}`}>
                      {stateLabel}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-slate-600">
                    JAN：{item.janCode ?? "-"}　
                    保管場所：{item.location}
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    理論在庫：{item.expectedQuantity}　
                    棚卸数：{item.countedQuantity ?? "-"}
                  </p>
                </article>
              );
            })}

            {visibleItems.length === 0 && (
              <p className="p-8 text-center text-slate-500">
                該当する商品はありません。
              </p>
            )}
          </div>
        </section>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-5">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-sm font-bold text-blue-600">
              最終確認
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              この内容で確定しますか？
            </h2>

            <p className="mt-4 leading-7 text-slate-700">
              棚卸済みの {data.summary.recordedCount} 件を正式在庫へ反映します。
              差異がある商品は在庫数を棚卸数へ更新し、履歴を残します。
            </p>

            {data.summary.unrecordedCount > 0 && (
              <p className="mt-3 rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-800">
                未棚卸の商品が {data.summary.unrecordedCount} 件あります。
                これらの在庫数は変更しません。
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={finishing}
                className="flex-1 rounded-2xl bg-slate-200 py-3 font-bold text-slate-700"
              >
                戻る
              </button>

              <button
                type="button"
                onClick={() => void applyStocktake()}
                disabled={finishing}
                className="flex-1 rounded-2xl bg-blue-600 py-3 font-bold text-white disabled:bg-slate-400"
              >
                {finishing ? "反映中..." : "正式に確定する"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}