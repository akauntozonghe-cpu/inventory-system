"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ConflictResolutionPanel from "@/components/stocktake/ConflictResolutionPanel";

type FilterMode = "DIFFERENCE" | "UNRECORDED" | "ALL";

type ResultItem = {
  id: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  difference: number | null;
  memo: string | null;
  recordedAt: string | null;
  location: string;
  unit: string | null;
  lotNo: string | null;
  expirationDate: string | null;
  item: {
    id: string;
    name: string;
    janCode: string | null;
    systemBarcode: string | null;
    managementCode: string | null;
    managementGroupCode: string | null;
    manufacturer: string | null;
    majorCategory: string | null;
    minorCategory: string | null;
  };
};

type ResultData = {
  session: {
    id: string;
    title: string;
    status:
      | "IN_PROGRESS"
      | "PAUSED"
      | "REVIEW"
      | "CONFLICT"
      | "COMPLETED"
      | "CANCELLED";
    operator: string | null;
    startedAt: string;
    completedAt: string | null;
    isOperator: boolean;
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

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      `結果データが空です。HTTP ${response.status}`
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `結果データの形式が正しくありません。HTTP ${response.status}`
    );
  }
}

export default function StocktakeResultPage() {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<ResultData | null>(null);
  const [filterMode, setFilterMode] =
    useState<FilterMode>("DIFFERENCE");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/stocktake/session/${encodeURIComponent(id)}/result`,
          { cache: "no-store" }
        );

        const payload = await readJson(response);

        if (!response.ok) {
          throw new Error(
            getMessage(
              payload,
              "棚卸結果の取得に失敗しました。"
            )
          );
        }

        if (!isResultData(payload)) {
          throw new Error(
            "棚卸結果のデータ形式が正しくありません。"
          );
        }

        if (!cancelled) {
          setData(payload);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "棚卸結果の取得に失敗しました。"
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
  }, [id]);

  const visibleItems = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.items.filter((item) => {
      if (filterMode === "ALL") {
        return true;
      }

      if (filterMode === "UNRECORDED") {
        return item.countedQuantity === null;
      }

      return (
        item.difference !== null &&
        item.difference !== 0
      );
    });
  }, [data, filterMode]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-700">
        棚卸結果を読み込んでいます…
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
        <section className="mx-auto max-w-xl rounded-3xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-black">
            棚卸結果を表示できません
          </h1>

          <p className="mt-4 text-red-700">
            {error || "データを取得できませんでした。"}
          </p>

          <Link
            href="/stocktake/start"
            className="mt-6 inline-flex rounded-2xl bg-slate-800 px-5 py-3 font-bold text-white"
          >
            棚卸開始へ戻る
          </Link>
        </section>
      </main>
    );
  }

  const isCompleted = data.session.status === "COMPLETED";
  const isConflict = data.session.status === "CONFLICT";
  const isCancelled = data.session.status === "CANCELLED";

  const statusLabel = isCompleted
    ? "終了・在庫反映済み"
    : isConflict
      ? "競合により安全停止中"
      : isCancelled
        ? "安全終了（在庫未反映）"
        : "棚卸作業中";

  const statusClass = isCompleted
    ? "bg-emerald-100 text-emerald-700"
    : isConflict
      ? "bg-red-100 text-red-700"
      : isCancelled
        ? "bg-slate-200 text-slate-700"
        : "bg-amber-100 text-amber-800";

  const filters: Array<{
    mode: FilterMode;
    label: string;
  }> = [
    { mode: "DIFFERENCE", label: "差異あり" },
    { mode: "UNRECORDED", label: "未棚卸" },
    { mode: "ALL", label: "すべて" },
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-600">
              棚卸結果
            </p>

            <h1 className="mt-1 break-words text-3xl font-black">
              {data.session.title}
            </h1>

            {data.session.operator && (
              <p className="mt-2 text-sm text-slate-600">
                担当者：{data.session.operator}
              </p>
            )}

            <span
              className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-bold ${statusClass}`}
            >
              {statusLabel}
            </span>
          </div>

          <Link
            href="/stocktake/start"
            className="rounded-2xl bg-slate-800 px-5 py-3 font-bold text-white"
          >
            棚卸開始へ戻る
          </Link>
        </header>

        {isCompleted && (
          <section className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
            <h2 className="font-black text-emerald-950">
              棚卸を終了しました
            </h2>

            <p className="mt-2 text-sm leading-6 text-emerald-800">
              保存済みの棚卸入力を在庫数へ反映しました。
              未棚卸の商品は、開始時点以降の在庫数を変更せず維持しています。
            </p>
          </section>
        )}

        {isConflict && (
          <>
            <section className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-5">
              <h2 className="font-black text-red-950">
                在庫競合のため安全停止中です
              </h2>

              <p className="mt-2 text-sm leading-6 text-red-800">
                棚卸開始後に在庫数が変更されたため、誤った反映を防止しました。
                在庫数は変更されていません。
              </p>
            </section>

            <ConflictResolutionPanel
              sessionId={data.session.id}
            />
          </>
        )}

        {isCancelled && (
          <section className="mt-5 rounded-3xl border border-slate-300 bg-slate-100 p-5">
            <h2 className="font-black text-slate-900">
              この棚卸は安全終了しました
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-700">
              在庫競合または安全上の理由により、在庫数を変更せず終了しました。
              棚卸入力と管理者の対応記録は履歴として保存されています。
            </p>
          </section>
        )}

        {!isCompleted && !isConflict && !isCancelled && (
          <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-black text-amber-900">
              この棚卸はまだ終了していません
            </h2>

            <p className="mt-2 text-sm leading-6 text-amber-800">
              作業画面へ戻り、棚卸を終了すると保存済み入力が在庫数へ反映されます。
            </p>

            <Link
              href={`/stocktake/${id}`}
              className="mt-4 inline-flex rounded-2xl bg-amber-600 px-4 py-3 text-sm font-bold text-white"
            >
              棚卸作業へ戻る
            </Link>
          </section>
        )}

        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryCard
            label="対象"
            value={data.summary.targetCount}
            color="text-slate-900"
          />
          <SummaryCard
            label="棚卸済"
            value={data.summary.recordedCount}
            color="text-blue-600"
          />
          <SummaryCard
            label="一致"
            value={data.summary.matchedCount}
            color="text-emerald-600"
          />
          <SummaryCard
            label="差異"
            value={data.summary.differenceCount}
            color="text-red-600"
          />
          <SummaryCard
            label="未棚卸"
            value={data.summary.unrecordedCount}
            color="text-orange-600"
          />
        </section>

        <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm">
          <div className="flex gap-2 overflow-x-auto">
            {filters.map((filter) => (
              <button
                key={filter.mode}
                type="button"
                onClick={() => setFilterMode(filter.mode)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
                  filterMode === filter.mode
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {visibleItems.map((item) => (
              <ResultRow key={item.id} item={item} />
            ))}

            {visibleItems.length === 0 && (
              <p className="p-10 text-center text-slate-500">
                該当する棚卸対象はありません。
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${color}`}>
        {value}
      </p>
    </div>
  );
}

function ResultRow({ item }: { item: ResultItem }) {
  const isUnrecorded = item.countedQuantity === null;
  const isMatched = item.difference === 0;

  const status = isUnrecorded
    ? "未棚卸"
    : isMatched
      ? "一致"
      : `差異 ${
          item.difference !== null && item.difference > 0
            ? "+"
            : ""
        }${item.difference ?? ""}`;

  const statusClass = isUnrecorded
    ? "bg-orange-100 text-orange-700"
    : isMatched
      ? "bg-emerald-100 text-emerald-700"
      : "bg-red-100 text-red-700";

  return (
    <article className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-black">
            {item.item.name}
          </h2>

          <p className="mt-1 break-all text-sm text-slate-600">
            JAN：{item.item.janCode ?? "-"}
          </p>

          <p className="mt-1 break-all text-sm text-slate-600">
            システムバーコード：
            {item.item.systemBarcode ?? "-"}
          </p>

          <p className="mt-1 text-sm text-slate-600">
            保管場所：{item.location}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${statusClass}`}
        >
          {status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Detail
          label="開始時在庫"
          value={`${item.expectedQuantity}${item.unit ?? ""}`}
        />
        <Detail
          label="棚卸数量"
          value={
            item.countedQuantity === null
              ? "-"
              : `${item.countedQuantity}${item.unit ?? ""}`
          }
        />
        <Detail label="ロット" value={item.lotNo ?? "-"} />
        <Detail label="期限" value={item.expirationDate ?? "-"} />
      </div>

      {(item.item.majorCategory ||
        item.item.minorCategory ||
        item.item.manufacturer) && (
        <div className="mt-3 text-sm text-slate-600">
          {item.item.manufacturer && (
            <p>メーカー：{item.item.manufacturer}</p>
          )}

          {(item.item.majorCategory ||
            item.item.minorCategory) && (
            <p className="mt-1">
              分類：
              {item.item.majorCategory ?? "-"}
              {item.item.minorCategory
                ? ` / ${item.item.minorCategory}`
                : ""}
            </p>
          )}
        </div>
      )}

      {item.memo && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          メモ：{item.memo}
        </p>
      )}
    </article>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-slate-500">{label}</p>
      <p className="mt-1 break-all text-base font-black">
        {value}
      </p>
    </div>
  );
}