"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getErrorGuidance } from "@/lib/error-guidance";
import AdminModeDialog from "@/components/stocktake/AdminModeDialog";

type CheckStatus = "PASS" | "WARNING" | "FAIL" | "NOT_RUN";
type RunStatus = "PASSED" | "WARNING" | "FAILED";
type StocktakeStatus =
  | "IN_PROGRESS"
  | "PAUSED"
  | "REVIEW"
  | "CONFLICT";

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

type ActiveSession = {
  id: string;
  title: string;
  operator: string | null;
  status: StocktakeStatus;
  scopeLabel: string | null;
  startedAt: string;
  pausedAt: string | null;
  updatedAt: string;
  operatorUser: {
    displayName: string;
    username: string;
  } | null;
  _count: {
    targets: number;
    records: number;
  };
};

type InventoryWithoutIdentifier = {
  id: string;
  quantity: number;
  unit: string | null;
  updatedAt: string;
  item: {
    id: string;
    name: string;
    janCode: string | null;
    systemBarcode: string | null;
    managementCode: string | null;
  };
  storageLocation: {
    id: string;
    name: string;
  } | null;
};

type ManualCheck = {
  code: string;
  title: string;
  status: CheckStatus;
  detail: string;
};

type ApiError = {
  code?: string;
  message?: string;
};

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
    title: "JAN・システムバーコードのカメラ読取",
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

function stocktakeStatusLabel(status: StocktakeStatus) {
  const labels: Record<StocktakeStatus, string> = {
    IN_PROGRESS: "作業中",
    PAUSED: "中断中",
    REVIEW: "確認待ち",
    CONFLICT: "競合中",
  };

  return labels[status];
}

function stocktakeStatusClass(status: StocktakeStatus) {
  const classes: Record<StocktakeStatus, string> = {
    IN_PROGRESS: "bg-blue-100 text-blue-800",
    PAUSED: "bg-amber-100 text-amber-800",
    REVIEW: "bg-violet-100 text-violet-800",
    CONFLICT: "bg-rose-100 text-rose-800",
  };

  return classes[status];
}

export default function SystemCheckPage() {
  const [runs, setRuns] = useState<CheckRun[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [inventoriesWithoutIdentifier, setInventoriesWithoutIdentifier] =
    useState<InventoryWithoutIdentifier[]>([]);
  const [manualChecks, setManualChecks] =
    useState<ManualCheck[]>(initialManualChecks);

  const [loading, setLoading] = useState(true);
  const [runningAuto, setRunningAuto] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [pendingRecovery, setPendingRecovery] = useState<{
    action: "PAUSE_SESSION" | "RESUME_SESSION" | "CANCEL_SESSION" | "ISSUE_SYSTEM_BARCODE";
    values: { sessionId?: string; itemId?: string; reason?: string };
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [cancelTarget, setCancelTarget] =
    useState<ActiveSession | null>(null);
  const [cancelReason, setCancelReason] = useState("");

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

  const loadRemediationTargets = useCallback(async () => {
    const response = await fetch("/api/admin/system-check/remediate", {
      cache: "no-store",
    });

    const data = await readJson(response);
    const payload = getErrorPayload(data);

    if (!response.ok) {
      throw new Error(
        `${payload.code ?? "SYSTEM_REMEDIATION_LIST_FAILED"}: ${
          payload.message ?? "復旧対象の情報を取得できませんでした。"
        }`
      );
    }

    const result =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : {};

    setActiveSessions(
      Array.isArray(result.activeSessions)
        ? (result.activeSessions as ActiveSession[])
        : []
    );

    setInventoriesWithoutIdentifier(
      Array.isArray(result.inventoriesWithoutIdentifier)
        ? (result.inventoriesWithoutIdentifier as InventoryWithoutIdentifier[])
        : []
    );
  }, []);

  const loadPageData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      await Promise.all([loadRuns(), loadRemediationTargets()]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "SYSTEM_CHECK_LOAD_FAILED: 点検情報を取得できませんでした。"
      );
    } finally {
      setLoading(false);
    }
  }, [loadRemediationTargets, loadRuns]);

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

  async function remediate(
    action:
      | "PAUSE_SESSION"
      | "RESUME_SESSION"
      | "CANCEL_SESSION"
      | "ISSUE_SYSTEM_BARCODE",
    values: {
      sessionId?: string;
      itemId?: string;
      reason?: string;
    }
  ) {
    const targetId = values.sessionId ?? values.itemId ?? "";

    if (!targetId) {
      return;
    }

    setWorkingId(`${action}-${targetId}`);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/system-check/remediate", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          ...values,
        }),
      });

      const data = await readJson(response);
      const payload = getErrorPayload(data);

      if (!response.ok) {
        if (payload.code === "ADMIN_ELEVATION_REQUIRED") {
          setPendingRecovery({ action, values });
          return;
        }
        throw new Error(
          `${payload.code ?? "SYSTEM_REMEDIATION_FAILED"}: ${
            payload.message ?? "管理者操作を実行できませんでした。"
          }`
        );
      }

      setMessage(
        payload.message ??
          "SYSTEM_REMEDIATION_COMPLETED: 管理者操作が完了しました。"
      );

      setCancelTarget(null);
      setCancelReason("");

      await loadPageData();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "SYSTEM_REMEDIATION_FAILED: 管理者操作を実行できませんでした。"
      );
    } finally {
      setWorkingId("");
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

          <Link
            href="/admin"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-800 px-5 font-bold text-white hover:bg-slate-700"
          >
            管理者設定へ戻る
          </Link>
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

        <section className="mt-7 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-black">復旧対象：進行中の棚卸</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                不要な棚卸は理由を残して取消できます。取消済みの入力は監査用に保持されます。
              </p>
            </div>

            <Link
              href="/admin/stocktake"
              className="text-sm font-bold text-blue-700 hover:text-blue-900"
            >
              棚卸管理を開く →
            </Link>
          </div>

          {loading ? (
            <p className="py-8 text-center text-slate-500">
              復旧対象を読み込んでいます…
            </p>
          ) : activeSessions.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              整理が必要な進行中・中断中・確認待ちの棚卸はありません。
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {activeSessions.map((session) => {
                const progress =
                  session._count.targets === 0
                    ? 0
                    : Math.round(
                        (session._count.records / session._count.targets) *
                          100
                      );

                const pauseWorking =
                  workingId === `PAUSE_SESSION-${session.id}`;
                const resumeWorking =
                  workingId === `RESUME_SESSION-${session.id}`;

                return (
                  <article
                    key={session.id}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-black">{session.title}</h3>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${stocktakeStatusClass(
                              session.status
                            )}`}
                          >
                            {stocktakeStatusLabel(session.status)}
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-slate-600">
                          担当者：
                          {session.operatorUser?.displayName ??
                            session.operator ??
                            "-"}
                          ・対象：
                          {session.scopeLabel ?? "全在庫"}
                        </p>

                        <p className="mt-1 text-sm text-slate-600">
                          進捗：{session._count.records} /{" "}
                          {session._count.targets}件（{progress}%）
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          最終更新：{formatDate(session.updatedAt)}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <Link
                          href={`/stocktake/${session.id}`}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-800 px-4 text-sm font-bold text-white hover:bg-slate-700"
                        >
                          開く
                        </Link>

                        {session.status === "IN_PROGRESS" && (
                          <button
                            type="button"
                            onClick={() =>
                              void remediate("PAUSE_SESSION", {
                                sessionId: session.id,
                              })
                            }
                            disabled={Boolean(workingId)}
                            className="min-h-11 rounded-xl bg-amber-500 px-4 text-sm font-bold text-white hover:bg-amber-600 disabled:bg-slate-400"
                          >
                            {pauseWorking ? "中断中…" : "中断"}
                          </button>
                        )}

                        {(session.status === "PAUSED" ||
                          session.status === "CONFLICT") && (
                          <button
                            type="button"
                            onClick={() =>
                              void remediate("RESUME_SESSION", {
                                sessionId: session.id,
                              })
                            }
                            disabled={Boolean(workingId)}
                            className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-slate-400"
                          >
                            {resumeWorking ? "再開中…" : "再開"}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setCancelTarget(session);
                            setCancelReason("");
                          }}
                          disabled={Boolean(workingId)}
                          className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700 disabled:bg-slate-400"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-7 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-black">
                復旧対象：識別コードがない商品
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                JANが存在しない商品だけに、システムバーコードを発行できます。
                既存JANがある場合は商品詳細からJANを登録してください。
              </p>
            </div>

            <Link
              href="/items"
              className="text-sm font-bold text-blue-700 hover:text-blue-900"
            >
              商品・在庫一覧を開く →
            </Link>
          </div>

          {loading ? (
            <p className="py-8 text-center text-slate-500">
              商品情報を読み込んでいます…
            </p>
          ) : inventoriesWithoutIdentifier.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              JANまたはシステムバーコードがない在庫はありません。
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {inventoriesWithoutIdentifier.map((inventory) => {
                const issueWorking =
                  workingId === `ISSUE_SYSTEM_BARCODE-${inventory.item.id}`;

                return (
                  <article
                    key={inventory.id}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="text-lg font-black">
                          {inventory.item.name}
                        </h3>

                        <p className="mt-2 text-sm text-slate-600">
                          保管場所：
                          {inventory.storageLocation?.name ?? "未設定"} ・
                          在庫：{inventory.quantity}
                          {inventory.unit ?? ""}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          管理番号：
                          {inventory.item.managementCode ?? "-"} ・ JAN：未登録
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        <Link
                          href={`/items/${inventory.item.id}`}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-800 px-4 text-sm font-bold text-white hover:bg-slate-700"
                        >
                          商品詳細
                        </Link>

                        <button
                          type="button"
                          onClick={() =>
                            void remediate("ISSUE_SYSTEM_BARCODE", {
                              itemId: inventory.item.id,
                            })
                          }
                          disabled={Boolean(workingId)}
                          className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-slate-400"
                        >
                          {issueWorking ? "発行中…" : "コード発行"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

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
                      const guidance = item.errorCode ? getErrorGuidance(item.errorCode) : null;
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
                        {item.status !== "PASS" && guidance && (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
                            <p><span className="font-black">次に行うこと：</span>{guidance.action}</p>
                            <details className="mt-2">
                              <summary className="cursor-pointer font-black">認証後の復旧手順を表示</summary>
                              <ol className="mt-2 list-decimal space-y-1 pl-5">{guidance.adminSteps.map((step) => <li key={step}>{step}</li>)}</ol>
                            </details>
                            <Link href={guidance.recoveryRoute} className="mt-3 inline-flex rounded-lg bg-slate-900 px-3 py-2 font-black text-white">対応画面を開く</Link>
                          </div>
                        )}
                      </article>
                    );})}
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      </div>

      {cancelTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
        >
          <section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-sm font-black text-rose-600">
              棚卸の取消確認
            </p>

            <h2 className="mt-1 text-2xl font-black">
              「{cancelTarget.title}」を取り消しますか？
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              作業中の棚卸は停止します。保存済みの入力記録は監査用に保持されますが、
              この棚卸は通常作業として再開できなくなります。
            </p>

            <label className="mt-5 block text-sm font-bold">
              取消理由
              <textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                rows={4}
                placeholder="例：テスト用に作成した棚卸のため"
                className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              />
            </label>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setCancelTarget(null);
                  setCancelReason("");
                }}
                disabled={Boolean(workingId)}
                className="min-h-12 rounded-xl bg-slate-200 font-bold text-slate-800 hover:bg-slate-300"
              >
                戻る
              </button>

              <button
                type="button"
                disabled={
                  !cancelReason.trim() || Boolean(workingId)
                }
                onClick={() =>
                  void remediate("CANCEL_SESSION", {
                    sessionId: cancelTarget.id,
                    reason: cancelReason,
                  })
                }
                className="min-h-12 rounded-xl bg-rose-600 font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {workingId === `CANCEL_SESSION-${cancelTarget.id}`
                  ? "取消中…"
                  : "理由を記録して取消"}
              </button>
            </div>
          </section>
        </div>
      )}
      <AdminModeDialog
        open={Boolean(pendingRecovery)}
        sessionId={pendingRecovery?.values.sessionId ?? ""}
        purpose="自動復旧で解決できなかった項目を変更します。手順と対象を確認し、IDとパスワードで認証してください。認証と実行結果はレポートへ記録されます。"
        onClose={() => setPendingRecovery(null)}
        onAuthenticated={() => {
          const pending = pendingRecovery;
          setPendingRecovery(null);
          if (pending) void remediate(pending.action, pending.values);
        }}
      />
    </main>
  );
}
