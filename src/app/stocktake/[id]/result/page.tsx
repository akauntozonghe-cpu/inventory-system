"use client";

import Link from "next/link";
import FeedbackToast from "@/components/common/FeedbackToast";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type StocktakeStatus =
  | "IN_PROGRESS"
  | "PAUSED"
  | "REVIEW"
  | "COMPLETED"
  | "CANCELLED";

type ResultRecord = {
  id: string;
  inventoryInstanceId: string;
  countedQuantity: number;
  expectedQuantity: number;
  difference: number;
  memo: string | null;
  item: {
    name: string;
    janCode: string | null;
    systemBarcode: string | null;
    manufacturer: string | null;
    majorCategory: string | null;
    minorCategory: string | null;
  };
  storageLocation: {
    name: string;
  } | null;
  unit: string | null;
};

type ResultData = {
  success: boolean;
  code?: string;
  message?: string;
  session: {
    id: string;
    title: string;
    operator: string | null;
    scopeLabel: string | null;
    status: StocktakeStatus;
    startedAt: string;
    completedAt: string | null;
  };
  permissions: {
    isOperator: boolean;
    isAdmin: boolean;
    canApply: boolean;
  };
  summary: {
    targetCount: number;
    recordedCount: number;
    matchedCount: number;
    differenceCount: number;
    unrecordedCount: number;
  };
  records: ResultRecord[];
};

function readMessage(value: unknown, fallback: string) {
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

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

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

export default function StocktakeResultPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;

  const [data, setData] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const loadResult = useCallback(async () => {
    const response = await fetch(
      `/api/stocktake/session/${sessionId}/result`,
      {
        cache: "no-store",
      }
    );

    const result: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        readMessage(result, "棚卸結果の取得に失敗しました。")
      );
    }

    setData(result as ResultData);
  }, [sessionId]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        await loadResult();
      } catch (loadError) {
        if (mounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "棚卸結果の取得に失敗しました。"
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
  }, [loadResult]);

  const applyStocktake = async () => {
    setApplying(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/stocktake/session/${sessionId}/apply`,
        {
          method: "POST",
        }
      );

      const result: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          readMessage(result, "棚卸結果を正式確定できませんでした。")
        );
      }

      setShowConfirm(false);
      setMessage(
        readMessage(
          result,
          "棚卸データを正式確定し、在庫へ反映しました。"
        )
      );

      await loadResult();

      window.setTimeout(() => {
        router.push("/stocktake/start");
      }, 1800);
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "棚卸結果を正式確定できませんでした。"
      );
      setShowConfirm(false);
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-5 text-white sm:p-8">
        <div className="mx-auto max-w-5xl rounded-3xl bg-white p-8 text-slate-900">
          棚卸結果を読み込んでいます…
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-950 p-5 text-white sm:p-8">
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 text-slate-900">
          <h1 className="text-2xl font-black">棚卸結果を開けませんでした</h1>
          <p className="mt-3 text-slate-600">
            {error || "棚卸結果を取得できませんでした。"}
          </p>
          <Link
            href="/stocktake/start"
            className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white"
          >
            棚卸開始へ戻る
          </Link>
        </div>
      </main>
    );
  }

  const isWorking =
    data.session.status === "IN_PROGRESS" ||
    data.session.status === "PAUSED";

  const isReview = data.session.status === "REVIEW";
  const isCompleted = data.session.status === "COMPLETED";

  return (
    <main className="min-h-screen bg-slate-950 pb-12 text-slate-950">
      <FeedbackToast
        message={error}
        tone="error"
        title="棚卸結果エラー"
        onClose={() => setError("")}
      />
      <FeedbackToast
        message={message}
        tone="success"
        onClose={() => setMessage("")}
        autoCloseMs={5000}
      />
      <header className="border-b border-slate-800 bg-slate-950 px-5 py-6 text-white sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold text-indigo-300">棚卸結果</p>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">
              {data.session.title}
            </h1>
            <p className="mt-2 text-slate-300">
              担当者：{data.session.operator || "未設定"}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              対象：{data.session.scopeLabel || "全在庫"}
            </p>
          </div>

          <Link
            href="/stocktake/start"
            className="rounded-xl bg-slate-700 px-5 py-3 text-center font-bold text-white transition hover:bg-slate-600"
          >
            棚卸開始へ戻る
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
        {isWorking && (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-2xl font-black text-amber-900">
              この棚卸はまだ終了していません
            </h2>
            <p className="mt-3 leading-7 text-amber-800">
              作業画面へ戻り、棚卸を終了すると結果確認・正式確定へ進めます。
              保存済みの棚卸入力は保護されています。
            </p>
            <Link
              href={`/stocktake/${sessionId}`}
              className="mt-5 inline-flex rounded-xl bg-amber-600 px-5 py-3 font-black text-white transition hover:bg-amber-500"
            >
              棚卸作業へ戻る
            </Link>
          </section>
        )}

        {isReview && (
          <section className="rounded-3xl border border-indigo-200 bg-indigo-50 p-6">
            <p className="text-sm font-bold text-indigo-600">確認待ち</p>
            <h2 className="mt-1 text-2xl font-black text-indigo-950">
              内容を確認して正式確定してください
            </h2>
            <p className="mt-3 leading-7 text-indigo-900">
              正式確定すると、保存済みの棚卸数量が在庫数へ反映され、棚卸履歴が作成されます。
              確定後も履歴から確認できます。
            </p>

            {data.permissions.canApply && (
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 font-black text-white transition hover:bg-indigo-500"
              >
                正式確定へ進む
              </button>
            )}
          </section>
        )}

        {isCompleted && (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
            <p className="text-sm font-bold text-emerald-600">正式確定済み</p>
            <h2 className="mt-1 text-2xl font-black text-emerald-950">
              在庫へ反映済みです
            </h2>
            <p className="mt-3 text-emerald-900">
              確定日時：{formatDate(data.session.completedAt)}
            </p>
          </section>
        )}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">対象</p>
            <p className="mt-2 text-3xl font-black">
              {data.summary.targetCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">棚卸済</p>
            <p className="mt-2 text-3xl font-black text-indigo-600">
              {data.summary.recordedCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">一致</p>
            <p className="mt-2 text-3xl font-black text-emerald-600">
              {data.summary.matchedCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">差異</p>
            <p className="mt-2 text-3xl font-black text-red-600">
              {data.summary.differenceCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">未棚卸</p>
            <p className="mt-2 text-3xl font-black text-orange-600">
              {data.summary.unrecordedCount}
            </p>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-black">差異・棚卸入力一覧</h2>
              <p className="mt-1 text-sm text-slate-500">
                保存済みの棚卸入力を確認できます。
              </p>
            </div>

            <p className="text-sm text-slate-500">
              作業開始：{formatDate(data.session.startedAt)}
            </p>
          </div>

          {data.records.length === 0 ? (
            <div className="mt-6 rounded-2xl bg-slate-100 p-6 text-center text-slate-600">
              保存済みの棚卸入力がありません。
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {data.records.map((record) => (
                <article
                  key={record.id}
                  className={`rounded-2xl border p-5 ${
                    record.difference === 0
                      ? "border-slate-200"
                      : "border-red-200 bg-red-50"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-black">
                        {record.item.name}
                      </h3>

                      <div className="mt-2 space-y-1 text-sm text-slate-600">
                        <p>JAN：{record.item.janCode || "-"}</p>
                        <p>
                          保管場所：
                          {record.storageLocation?.name || "未設定"}
                        </p>
                        <p>
                          分類：
                          {record.item.majorCategory || "-"}
                          {record.item.minorCategory
                            ? ` ／ ${record.item.minorCategory}`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`rounded-xl px-4 py-2 text-center font-black ${
                        record.difference === 0
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {record.difference === 0
                        ? "一致"
                        : `差異 ${record.difference > 0 ? "+" : ""}${
                            record.difference
                          }`}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-100 p-3">
                      <p className="text-slate-500">理論在庫</p>
                      <p className="mt-1 text-xl font-black">
                        {record.expectedQuantity}
                        {record.unit ? ` ${record.unit}` : " 個"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-100 p-3">
                      <p className="text-slate-500">棚卸数量</p>
                      <p className="mt-1 text-xl font-black">
                        {record.countedQuantity}
                        {record.unit ? ` ${record.unit}` : " 個"}
                      </p>
                    </div>
                  </div>

                  {record.memo && (
                    <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                      メモ：{record.memo}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-5">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-black">正式確定しますか？</h2>
            <p className="mt-4 leading-7 text-slate-600">
              棚卸数量を在庫数へ反映します。確定後は通常の棚卸入力へ戻せません。
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={applying}
                className="rounded-xl bg-slate-100 px-4 py-3 font-black text-slate-700"
              >
                戻る
              </button>

              <button
                type="button"
                onClick={() => void applyStocktake()}
                disabled={applying}
                className="rounded-xl bg-indigo-600 px-4 py-3 font-black text-white disabled:opacity-50"
              >
                {applying ? "確定中…" : "正式確定する"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
