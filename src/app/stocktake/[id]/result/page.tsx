"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type ResultData = {
  session: {
    id: string;
    title: string;
    operator: string | null;
    location: string | null;
    memo: string | null;
    status: "IN_PROGRESS" | "PAUSED" | "COMPLETED";
    startedAt: string;
    completedAt: string | null;
  };
  summary: {
    totalInventoryCount: number;
    recordedCount: number;
    matchedCount: number;
    differenceCount: number;
    unrecordedCount: number;
  };
  records: Array<{
    id: string;
    inventoryInstanceId: string;
    countedQuantity: number;
    expectedQuantity: number;
    difference: number;
    memo: string | null;
    item: {
      name: string;
      janCode: string | null;
    };
    storageLocation: {
      name: string;
    } | null;
  }>;
};

export default function StocktakeResultPage() {
  const params = useParams<{ id: string }>();

  const [data, setData] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const res = await fetch(
          `/api/stocktake/session/${params.id}/result`
        );

        if (!res.ok) {
          const response = await res.json();
          throw new Error(response.message ?? "結果を取得できませんでした");
        }

        const result: ResultData = await res.json();
        setData(result);
      } catch (error) {
        console.error(error);

        setError(
          error instanceof Error
            ? error.message
            : "結果を取得できませんでした"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [params.id]);

  if (loading) {
    return <main className="p-8 text-white">結果を読み込み中...</main>;
  }

  if (error || !data) {
    return (
      <main className="p-8 text-white">
        <p>{error || "結果を取得できませんでした"}</p>
      </main>
    );
  }

  const { session, summary, records } = data;

  return (
    <main className="mx-auto max-w-7xl p-8 text-white">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">棚卸結果</h1>
          <p className="mt-2 text-slate-300">{session.title}</p>
          <p className="text-sm text-slate-400">
            担当者：{session.operator || "管理者"}
            {session.location ? `　棚・エリア：${session.location}` : ""}
          </p>
        </div>

        <Link
          href={`/stocktake/${session.id}`}
          className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700"
        >
          棚卸入力へ戻る
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          label="対象在庫"
          value={summary.totalInventoryCount}
          color="text-slate-900"
        />
        <SummaryCard
          label="棚卸済"
          value={summary.recordedCount}
          color="text-blue-600"
        />
        <SummaryCard
          label="一致"
          value={summary.matchedCount}
          color="text-green-600"
        />
        <SummaryCard
          label="差異"
          value={summary.differenceCount}
          color="text-red-600"
        />
        <SummaryCard
          label="未棚卸"
          value={summary.unrecordedCount}
          color="text-orange-600"
        />
      </div>

      <section className="mt-8 rounded-xl bg-white p-6 text-slate-800 shadow">
        <h2 className="text-2xl font-bold text-slate-900">差異一覧</h2>

        {summary.differenceCount === 0 ? (
          <p className="mt-4 text-slate-600">
            現在保存されている棚卸データに差異はありません。
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-3 py-3">商品名</th>
                  <th className="px-3 py-3">保管場所</th>
                  <th className="px-3 py-3 text-right">現在庫</th>
                  <th className="px-3 py-3 text-right">棚卸数</th>
                  <th className="px-3 py-3 text-right">差異</th>
                </tr>
              </thead>

              <tbody>
                {records
                  .filter((record) => record.difference !== 0)
                  .map((record) => (
                    <tr
                      key={record.id}
                      className="border-b border-slate-100"
                    >
                      <td className="px-3 py-4 font-semibold">
                        {record.item.name}
                        <div className="mt-1 text-sm font-normal text-slate-500">
                          JAN：{record.item.janCode ?? "-"}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        {record.storageLocation?.name ?? "-"}
                      </td>
                      <td className="px-3 py-4 text-right">
                        {record.expectedQuantity}
                      </td>
                      <td className="px-3 py-4 text-right">
                        {record.countedQuantity}
                      </td>
                      <td
                        className={`px-3 py-4 text-right text-lg font-bold ${
                          record.difference > 0
                            ? "text-red-600"
                            : "text-orange-600"
                        }`}
                      >
                        {record.difference > 0 ? "+" : ""}
                        {record.difference}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
    <div className="rounded-xl bg-white p-5 text-slate-800 shadow">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}