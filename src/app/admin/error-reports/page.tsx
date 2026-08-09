"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Severity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";
type ReportStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "DISMISSED";
type RecoveryStatus =
  | "NOT_ATTEMPTED"
  | "IN_PROGRESS"
  | "RECOVERED"
  | "FAILED"
  | "ADMIN_REQUIRED";
type Filter = "ALL" | "OPEN" | "ADMIN_REQUIRED" | "RESOLVED";

type ErrorReport = {
  id: string;
  code: string;
  title: string;
  message: string;
  severity: Severity;
  status: ReportStatus;
  route: string | null;
  sessionId: string | null;
  detail: unknown;
  occurredAt: string;
  resolvedAt: string | null;
  recoveryStatus: RecoveryStatus;
  recoveryAttempts: number;
  recoveredAt: string | null;
  recoveryNote: string | null;
  reporterUser: {
    id: string;
    username: string;
    displayName: string;
  } | null;
  adminActionLogs: {
    id: string;
    action: string;
    detail: unknown;
    route: string | null;
    createdAt: string;
    adminUser: {
      id: string;
      username: string;
      displayName: string;
    };
  }[];
};

function getMessage(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
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
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function detailText(value: unknown) {
  if (value === null || value === undefined) {
    return "詳細情報はありません。";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "詳細情報を表示できません。";
  }
}

function severityLabel(value: Severity) {
  switch (value) {
    case "INFO":
      return "情報";
    case "WARNING":
      return "警告";
    case "ERROR":
      return "エラー";
    case "CRITICAL":
      return "重大";
  }
}

function recoveryLabel(value: RecoveryStatus) {
  switch (value) {
    case "NOT_ATTEMPTED":
      return "未実行";
    case "IN_PROGRESS":
      return "自動復旧中";
    case "RECOVERED":
      return "自動復旧済み";
    case "FAILED":
      return "自動復旧失敗";
    case "ADMIN_REQUIRED":
      return "管理者対応が必要";
  }
}

function statusLabel(value: ReportStatus) {
  switch (value) {
    case "OPEN":
      return "未対応";
    case "INVESTIGATING":
      return "確認中";
    case "RESOLVED":
      return "解決済み";
    case "DISMISSED":
      return "対応不要";
  }
}

function severityClass(value: Severity) {
  switch (value) {
    case "CRITICAL":
      return "bg-red-100 text-red-700";
    case "ERROR":
      return "bg-orange-100 text-orange-700";
    case "WARNING":
      return "bg-yellow-100 text-yellow-800";
    case "INFO":
      return "bg-blue-100 text-blue-700";
  }
}

function statusClass(value: ReportStatus) {
  switch (value) {
    case "OPEN":
      return "bg-red-100 text-red-700";
    case "INVESTIGATING":
      return "bg-violet-100 text-violet-700";
    case "RESOLVED":
      return "bg-emerald-100 text-emerald-700";
    case "DISMISSED":
      return "bg-slate-200 text-slate-700";
  }
}

export default function ErrorReportsPage() {
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<ErrorReport | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
          getMessage(data, "エラーレポート一覧を取得できませんでした。")
        );
      }

      setReports(data as ErrorReport[]);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "エラーレポート一覧を取得できませんでした。"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  const filteredReports = useMemo(() => {
    switch (filter) {
      case "OPEN":
        return reports.filter(
          (report) =>
            report.status === "OPEN" ||
            report.status === "INVESTIGATING"
        );
      case "ADMIN_REQUIRED":
        return reports.filter(
          (report) => report.recoveryStatus === "ADMIN_REQUIRED"
        );
      case "RESOLVED":
        return reports.filter(
          (report) =>
            report.status === "RESOLVED" ||
            report.status === "DISMISSED"
        );
      default:
        return reports;
    }
  }, [filter, reports]);

  const unresolvedCount = reports.filter(
    (report) =>
      report.status === "OPEN" || report.status === "INVESTIGATING"
  ).length;

  const adminRequiredCount = reports.filter(
    (report) => report.recoveryStatus === "ADMIN_REQUIRED"
  ).length;

  const updateReport = async (action: "RESOLVE" | "DISMISS") => {
    if (!selected) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/error-reports", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportId: selected.id,
          action,
          note,
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(getMessage(data, "管理者操作に失敗しました。"));
      }

      setSelected(null);
      setNote("");
      await loadReports();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "管理者操作に失敗しました。"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-widest text-indigo-600">
              ADMINISTRATION
            </p>
            <h1 className="mt-1 text-3xl font-bold">エラーレポート</h1>
            <p className="mt-2 text-slate-600">
              自動復旧・管理者対応の記録を確認します。
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/admin"
              className="rounded-xl bg-slate-200 px-4 py-3 font-bold hover:bg-slate-300"
            >
              管理画面へ戻る
            </Link>

            <button
              type="button"
              onClick={() => void loadReports()}
              disabled={loading}
              className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-400"
            >
              {loading ? "更新中…" : "更新"}
            </button>
          </div>
        </header>

        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">記録件数</p>
            <p className="mt-1 text-3xl font-bold">{reports.length}</p>
          </div>

          <div className="rounded-2xl bg-orange-50 p-5 shadow-sm ring-1 ring-orange-200">
            <p className="text-sm text-orange-700">未対応・確認中</p>
            <p className="mt-1 text-3xl font-bold text-orange-700">
              {unresolvedCount}
            </p>
          </div>

          <div className="rounded-2xl bg-red-50 p-5 shadow-sm ring-1 ring-red-200">
            <p className="text-sm text-red-700">管理者対応が必要</p>
            <p className="mt-1 text-3xl font-bold text-red-700">
              {adminRequiredCount}
            </p>
          </div>
        </section>

        <section className="mb-5 flex flex-wrap gap-2">
          {[
            ["ALL", "すべて"],
            ["OPEN", "未対応"],
            ["ADMIN_REQUIRED", "管理者対応"],
            ["RESOLVED", "解決済み"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value as Filter)}
              className={`rounded-full px-4 py-2 font-bold ${
                filter === value
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </section>

        {message && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow-sm">
            エラーレポートを読み込んでいます…
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow-sm">
            条件に一致するエラーレポートはありません。
          </div>
        ) : (
          <section className="space-y-4">
            {filteredReports.map((report) => (
              <article
                key={report.id}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex flex-col justify-between gap-4 lg:flex-row">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-sm font-bold ${severityClass(
                          report.severity
                        )}`}
                      >
                        {severityLabel(report.severity)}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-sm font-bold ${statusClass(
                          report.status
                        )}`}
                      >
                        {statusLabel(report.status)}
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
                        {recoveryLabel(report.recoveryStatus)}
                      </span>
                    </div>

                    <p className="mt-4 font-mono text-xs font-bold text-slate-500">
                      {report.code}
                    </p>

                    <h2 className="mt-1 text-xl font-bold">{report.title}</h2>
                    <p className="mt-2 whitespace-pre-wrap text-slate-700">
                      {report.message}
                    </p>

                    <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                      <p>
                        <span className="font-bold text-slate-800">発生日時：</span>
                        {formatDate(report.occurredAt)}
                      </p>
                      <p>
                        <span className="font-bold text-slate-800">
                          報告ユーザー：
                        </span>
                        {report.reporterUser?.displayName ?? "システム"}
                      </p>
                      <p className="break-all">
                        <span className="font-bold text-slate-800">
                          発生画面：
                        </span>
                        {report.route ?? "-"}
                      </p>
                      <p>
                        <span className="font-bold text-slate-800">
                          自動復旧試行：
                        </span>
                        {report.recoveryAttempts} 回
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelected(report);
                      setNote(report.recoveryNote ?? "");
                    }}
                    className="h-fit shrink-0 rounded-xl bg-slate-800 px-4 py-3 font-bold text-white hover:bg-slate-950"
                  >
                    詳細・対応
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4">
          <section className="mx-auto my-6 max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-bold text-slate-500">
                  {selected.code}
                </p>
                <h2 className="mt-1 text-2xl font-bold">{selected.title}</h2>
              </div>

              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg bg-slate-100 px-3 py-2 font-bold hover:bg-slate-200"
              >
                閉じる
              </button>
            </div>

            <p className="mt-5 whitespace-pre-wrap text-slate-700">
              {selected.message}
            </p>

            <section className="mt-5 rounded-xl bg-slate-100 p-4">
              <p className="font-bold">自動復旧メモ</p>
              <p className="mt-1 text-slate-700">
                {selected.recoveryNote ?? "記録はありません。"}
              </p>
            </section>

            <section className="mt-5">
              <p className="font-bold">技術詳細</p>
              <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                {detailText(selected.detail)}
              </pre>
            </section>

            <section className="mt-5">
              <p className="font-bold">管理者対応履歴</p>

              {selected.adminActionLogs.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  まだ対応履歴はありません。
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {selected.adminActionLogs.map((log) => (
                    <div key={log.id} className="rounded-xl bg-slate-100 p-3">
                      <p className="font-bold">{log.action}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatDate(log.createdAt)} · {log.adminUser.displayName}
                      </p>

                      {log.detail !== null && log.detail !== undefined && (
                        <pre className="mt-2 overflow-auto text-xs text-slate-600">
                          {detailText(log.detail)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-5">
              <label className="block font-bold">管理者メモ</label>
              <textarea
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="mt-2 w-full rounded-xl border p-3"
                placeholder="対応内容・判断理由を記録"
              />
            </section>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => void updateReport("DISMISS")}
                disabled={saving}
                className="rounded-xl bg-slate-200 px-5 py-3 font-bold text-slate-800 hover:bg-slate-300 disabled:opacity-50"
              >
                対応不要として記録
              </button>

              <button
                type="button"
                onClick={() => void updateReport("RESOLVE")}
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "記録中…" : "解決済みとして記録"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}