"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type AdminActionLog = {
  id: string;
  action: string;
  route: string | null;
  createdAt: string;
  adminUser: {
    displayName: string;
    username: string;
  };
};

type ErrorReport = {
  id: string;
  code: string;
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "DISMISSED";
  route: string | null;
  sessionId: string | null;
  detail: unknown;
  occurredAt: string;
  resolvedAt: string | null;
  recoveryStatus:
    | "NOT_ATTEMPTED"
    | "IN_PROGRESS"
    | "RECOVERED"
    | "FAILED"
    | "ADMIN_REQUIRED";
  recoveryAttempts: number;
  recoveredAt: string | null;
  recoveryNote: string | null;
  reporterUser: {
    displayName: string;
    username: string;
  } | null;
  adminActionLogs: AdminActionLog[];
};

type StatusFilter = "ALL" | ErrorReport["status"];

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

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function statusLabel(status: ErrorReport["status"]) {
  if (status === "OPEN") return "未対応";
  if (status === "INVESTIGATING") return "対応中";
  if (status === "RESOLVED") return "解決済み";
  return "保留";
}

function recoveryLabel(status: ErrorReport["recoveryStatus"]) {
  if (status === "NOT_ATTEMPTED") return "未実施";
  if (status === "IN_PROGRESS") return "自動復旧中";
  if (status === "RECOVERED") return "自動復旧済み";
  if (status === "FAILED") return "自動復旧失敗";
  return "管理者対応待ち";
}

export default function ErrorReportsPage() {
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [selected, setSelected] = useState<ErrorReport | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadReports = async () => {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/error-reports", {
        cache: "no-store",
      });

      const data: unknown = await response.json();

      if (!response.ok || !Array.isArray(data)) {
        throw new Error(
          getMessage(data, "エラーレポートを取得できませんでした。")
        );
      }

      setReports(data as ErrorReport[]);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "エラーレポートを取得できませんでした。"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  const filteredReports = useMemo(() => {
    if (statusFilter === "ALL") {
      return reports;
    }

    return reports.filter((report) => report.status === statusFilter);
  }, [reports, statusFilter]);

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-950 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-blue-600">
              ADMINISTRATION
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              エラーレポート
            </h1>

            <p className="mt-2 text-slate-600">
              自動復旧・一時保存・管理者対応の記録を確認できます。
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/admin/users"
              className="rounded-xl bg-slate-200 px-4 py-3 text-sm font-bold text-slate-800"
            >
              ユーザー管理
            </Link>

            <button
              type="button"
              onClick={() => void loadReports()}
              disabled={loading}
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-400"
            >
              {loading ? "更新中..." : "更新"}
            </button>
          </div>
        </header>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ["ALL", "すべて"],
              ["OPEN", "未対応"],
              ["INVESTIGATING", "対応中"],
              ["RESOLVED", "解決済み"],
              ["DISMISSED", "保留"],
            ] as Array<[StatusFilter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
                statusFilter === value
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-700 shadow-sm"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {message && (
          <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 font-semibold text-red-700">
            {message}
          </p>
        )}

        <section className="mt-5 space-y-3">
          {loading ? (
            <div className="rounded-3xl bg-white p-8 text-slate-500 shadow-sm">
              レポートを読み込み中...
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-slate-500 shadow-sm">
              該当するエラーレポートはありません。
            </div>
          ) : (
            filteredReports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => setSelected(report)}
                className="w-full rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-400"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-red-600">
                      {report.code}
                    </p>

                    <h2 className="mt-1 text-lg font-bold">
                      {report.title}
                    </h2>

                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                      {report.message}
                    </p>

                    <p className="mt-3 text-xs text-slate-500">
                      発生：{formatDate(report.occurredAt)}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                      {statusLabel(report.status)}
                    </span>

                    <p className="mt-3 text-xs font-bold text-slate-600">
                      {recoveryLabel(report.recoveryStatus)}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </section>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-4 sm:p-8">
          <section className="mx-auto my-4 max-w-2xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-sm font-bold text-red-600">
                  {selected.code}
                </p>

                <h2 className="mt-1 text-2xl font-bold">
                  {selected.title}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-xl bg-slate-100 px-3 py-2 font-bold"
              >
                閉じる
              </button>
            </div>

            <dl className="mt-6 space-y-5">
              <div>
                <dt className="text-sm font-bold text-slate-500">
                  エラー事象
                </dt>

                <dd className="mt-1 leading-7">{selected.message}</dd>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    発生日時
                  </dt>

                  <dd className="mt-1">
                    {formatDate(selected.occurredAt)}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    発生ユーザー
                  </dt>

                  <dd className="mt-1">
                    {selected.reporterUser
                      ? `${selected.reporterUser.displayName}（${selected.reporterUser.username}）`
                      : "記録なし"}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    自動復旧
                  </dt>

                  <dd className="mt-1">
                    {recoveryLabel(selected.recoveryStatus)}
                    {" / "}
                    {selected.recoveryAttempts}回試行
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    棚卸ID
                  </dt>

                  <dd className="mt-1 break-all">
                    {selected.sessionId ?? "-"}
                  </dd>
                </div>
              </div>

              {selected.recoveryNote && (
                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    復旧記録
                  </dt>

                  <dd className="mt-1 rounded-2xl bg-slate-50 p-4">
                    {selected.recoveryNote}
                  </dd>
                </div>
              )}

              {selected.adminActionLogs.length > 0 && (
                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    管理者対応履歴
                  </dt>

                  <dd className="mt-2 space-y-2">
                    {selected.adminActionLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-2xl bg-slate-50 p-4 text-sm"
                      >
                        <p className="font-bold">{log.action}</p>
                        <p className="mt-1 text-slate-600">
                          {log.adminUser.displayName} /{" "}
                          {formatDate(log.createdAt)}
                        </p>
                      </div>
                    ))}
                  </dd>
                </div>
              )}

              {selected.detail !== null && selected.detail !== undefined && (
                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    技術情報
                  </dt>

                  <dd className="mt-1 overflow-x-auto rounded-2xl bg-slate-950 p-4 font-mono text-xs text-slate-100">
                    {JSON.stringify(selected.detail, null, 2)}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      )}
    </main>
  );
}