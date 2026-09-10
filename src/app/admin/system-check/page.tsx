"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import InspectionRecovery from "@/components/InspectionRecovery";

type CheckStatus = "PASS" | "WARNING" | "FAIL" | "NOT_RUN";
type RunStatus = "PASSED" | "WARNING" | "FAILED";

type CheckItem = {
  id: string;
  code: string;
  title: string;
  type: "AUTO" | "MANUAL";
  status: CheckStatus;
  detail: string | null;
  expected: string | null;
  actual: string | null;
  errorCode: string | null;
  checkedAt: string;
};

type CheckRun = {
  id: string;
  mode: "AUTO" | "MANUAL";
  status: RunStatus;
  summary: string | null;
  createdAt: string;
  completedAt: string | null;
  executedBy: {
    displayName: string;
    username: string;
  };
  items: CheckItem[];
};

type ManualCheck = {code:string;title:string;status:CheckStatus;detail:string};
type ApiError = {code?:string;message?:string};
const initialManualChecks: ManualCheck[] = [
  {
    code: "MANUAL_LOGIN",
    title: "ログイン・ログアウト",
    status: "NOT_RUN",
    detail: "",
  },
  {
    code: "MANUAL_WORKER_STOCKTAKE",
    title: "一般ユーザーの棚卸開始・保存",
    status: "NOT_RUN",
    detail: "",
  },
  {
    code: "MANUAL_ADMIN_MENU",
    title: "管理者メニュー・権限確認",
    status: "NOT_RUN",
    detail: "",
  },
  {
    code: "MANUAL_BARCODE_CAMERA",
    title: "JAN・システムJANのカメラ読取",
    status: "NOT_RUN",
    detail: "",
  },
  {
    code: "MANUAL_CATEGORY_QR",
    title: "大分類QR読取・棚卸対象の絞り込み",
    status: "NOT_RUN",
    detail: "",
  },
  {
    code: "MANUAL_PRODUCT_REGISTRATION",
    title: "商品登録・在庫への即時反映",
    status: "NOT_RUN",
    detail: "",
  },
  {
    code: "MANUAL_MOBILE_LAYOUT",
    title: "スマホ画面の表示・操作性",
    status: "NOT_RUN",
    detail: "",
  },
];

function getErrorPayload(value: unknown): ApiError {
  if (value && typeof value === "object") {
    return value as ApiError;
  }

  return {};
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      "SYSTEM_CHECK_INVALID_RESPONSE: サーバーから正しい応答を取得できませんでした。"
    );
  }
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
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: CheckStatus | RunStatus) {
  const labels: Record<CheckStatus | RunStatus, string> = {
    PASS: "正常",
    WARNING: "注意",
    FAIL: "異常",
    NOT_RUN: "未実施",
    PASSED: "正常",
    FAILED: "異常",
  };

  return labels[status];
}

function statusClass(status: CheckStatus | RunStatus) {
  if (status === "PASS" || status === "PASSED") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (status === "WARNING" || status === "NOT_RUN") {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-rose-100 text-rose-800";
}

export default function SystemCheckPage() {
  const [runs, setRuns] = useState<CheckRun[]>([]);
  const [manualChecks, setManualChecks] =
    useState<ManualCheck[]>(initialManualChecks);

  const [loading, setLoading] = useState(true);
  const [runningAuto, setRunningAuto] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const latestRun = useMemo(() => runs[0] ?? null, [runs]);

  const loadRuns = useCallback(async () => {
    const response = await fetch("/api/admin/system-check", {
      cache: "no-store",
    });

    const data = await readJson(response);
    const payload = getErrorPayload(data);

    if (!response.ok) {
      throw new Error(
        `${payload.code ?? "SYSTEM_CHECK_LIST_FAILED"}: ${
          payload.message ?? "点検履歴を取得できませんでした。"
        }`
      );
    }

    const rawRuns =
      data && typeof data === "object" && "runs" in data
        ? (data as { runs?: unknown }).runs
        : [];

    setRuns(Array.isArray(rawRuns) ? (rawRuns as CheckRun[]) : []);
  }, []);

  const loadPageData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      await loadRuns();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "SYSTEM_CHECK_LOAD_FAILED: 点検情報を取得できませんでした。"
      );
    } finally {
      setLoading(false);
    }
  }, [loadRuns]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  async function runAutoCheck() {
    setRunningAuto(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/system-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "RUN_AUTO",
        }),
      });

      const data = await readJson(response);
      const payload = getErrorPayload(data);

      if (!response.ok) {
        throw new Error(
          `${payload.code ?? "SYSTEM_CHECK_AUTO_FAILED"}: ${
            payload.message ?? "自動点検を実行できませんでした。"
          }`
        );
      }

      setMessage(
        payload.message ??
          "SYSTEM_CHECK_AUTO_COMPLETED: 自動点検が完了しました。"
      );

      await loadPageData();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "SYSTEM_CHECK_AUTO_FAILED: 自動点検を実行できませんでした。"
      );
    } finally {
      setRunningAuto(false);
    }
  }

  async function saveManualCheck() {
    setSavingManual(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/system-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "SAVE_MANUAL",
          checks: manualChecks,
        }),
      });

      const data = await readJson(response);
      const payload = getErrorPayload(data);

      if (!response.ok) {
        throw new Error(
          `${payload.code ?? "SYSTEM_CHECK_MANUAL_FAILED"}: ${
            payload.message ?? "手動点検を保存できませんでした。"
          }`
        );
      }

      setMessage(
        payload.message ??
          "SYSTEM_CHECK_MANUAL_SAVED: 手動点検の結果を保存しました。"
      );

      await loadRuns();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "SYSTEM_CHECK_MANUAL_FAILED: 手動点検を保存できませんでした。"
      );
    } finally {
      setSavingManual(false);
    }
  }

  function updateManualCheck(
    index: number,
    field: "status" | "detail",
    value: string
  ) {
    setManualChecks((current) =>
      current.map((check, checkIndex) => {
        if (checkIndex !== index) {
          return check;
        }

        if (field === "status") {
          return {
            ...check,
            status: value as CheckStatus,
          };
        }

        return {
          ...check,
          detail: value,
        };
      })
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin/recovery" className="mb-4 inline-block rounded-xl bg-blue-700 p-3 font-bold text-white">診断から復旧まで順に進める</Link>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black tracking-[0.12em] text-cyan-700">
              ADMINISTRATOR MODE
            </p>

            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
              システム点検・復旧
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              自動診断で状態を確認し、必要なら安全な管理者操作で整理します。
              自動点検は在庫数を変更しません。
            </p>
          </div>


        </header>

        {message && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
            {error}
          </div>
        )}

        <section className="mt-7 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">自動点検</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                DB接続、管理者アカウント、棚卸状態、商品識別コードを確認します。
              </p>
            </div>

            <button
              type="button"
              onClick={() => void runAutoCheck()}
              disabled={runningAuto}
              className="min-h-12 rounded-2xl bg-cyan-600 px-6 font-bold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {runningAuto ? "点検中…" : "自動点検を実行"}
            </button>
          </div>

          {latestRun && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-black">直近の点検</p>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(
                    latestRun.status
                  )}`}
                >
                  {statusLabel(latestRun.status)}
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-700">
                {latestRun.summary ?? "結果の要約はありません。"}
              </p>

              <p className="mt-2 text-xs text-slate-500">
                {formatDate(latestRun.createdAt)} ・ 実行者：
                {latestRun.executedBy.displayName}
              </p>
            </div>
          )}
        </section>

        <p className="mt-5 rounded-xl bg-blue-50 p-4">担当者別の棚卸は独立した作業です。正常な並行作業は復旧対象に含めません。下の点検結果を開くと、問題のある対象と処置を確認できます。</p>
        <section className="mt-7 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h2 className="text-xl font-black">手動点検</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              実際の端末・カメラ・画面操作を確認して、結果を保存します。
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {manualChecks.map((check, index) => (
              <article
                key={check.code}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black">{check.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {check.code}
                    </p>
                  </div>

                  <select
                    value={check.status}
                    onChange={(event) =>
                      updateManualCheck(index, "status", event.target.value)
                    }
                    className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 font-bold"
                  >
                    <option value="NOT_RUN">未実施</option>
                    <option value="PASS">正常</option>
                    <option value="WARNING">注意</option>
                    <option value="FAIL">異常</option>
                  </select>
                </div>

                <input
                  value={check.detail}
                  onChange={(event) =>
                    updateManualCheck(index, "detail", event.target.value)
                  }
                  placeholder="確認内容・再現手順・補足を入力"
                  className="mt-3 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
                />
              </article>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void saveManualCheck()}
            disabled={savingManual}
            className="mt-5 min-h-12 w-full rounded-2xl bg-slate-800 px-6 font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
          >
            {savingManual ? "保存中…" : "手動点検を保存"}
          </button>
        </section>

        <section className="mt-7 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">点検履歴</h2>
              <p className="mt-1 text-sm text-slate-600">
                異常が出た点検は、エラー・復旧レポートとあわせて確認してください。
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadPageData()}
              disabled={loading}
              className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold hover:bg-slate-50 disabled:bg-slate-100"
            >
              更新
            </button>
          </div>

          {loading ? (
            <p className="py-10 text-center text-slate-500">
              点検履歴を読み込んでいます…
            </p>
          ) : runs.length === 0 ? (
            <p className="py-10 text-center text-slate-500">
              まだ点検履歴はありません。
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {runs.map((run) => (
                <details
                  key={run.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black">
                        {run.mode === "AUTO" ? "自動点検" : "手動点検"}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(
                          run.status
                        )}`}
                      >
                        {statusLabel(run.status)}
                      </span>

                      <span className="text-xs text-slate-500">
                        {formatDate(run.createdAt)} ・
                        {run.executedBy.displayName}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-700">
                      {run.summary ?? "結果の要約はありません。"}
                    </p>
                  </summary>

                  <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                    {run.items.map((item) => {

                      return (
                      <article
                        key={item.id}
                        className="rounded-xl bg-slate-50 p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold">{item.title}</h3>

                          <span
                            className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(
                              item.status
                            )}`}
                          >
                            {statusLabel(item.status)}
                          </span>

                          {item.errorCode && (
                            <code className="rounded bg-rose-100 px-2 py-1 text-xs text-rose-800">
                              {item.errorCode}
                            </code>
                          )}
                        </div>

                        {item.detail && (
                          <p className="mt-2 text-slate-700">
                            {item.detail}
                          </p>
                        )}

                        {(item.expected || item.actual) && (
                          <p className="mt-2 text-xs text-slate-500">
                            期待値：{item.expected ?? "-"} / 実測値：
                            {item.actual ?? "-"}
                          </p>
                        )}
                        {item.status !== "PASS" && <InspectionRecovery checkCode={item.code} runId={run.id} onChanged={runAutoCheck}/>}
                      </article>
                    );})}
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      </div>

    </main>
  );
}
