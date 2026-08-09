"use client";

import { type ReactNode, useRef, useState } from "react";

type AdminAuthResult = {
  success: boolean;
  message?: string;
};

type SystemErrorDialogProps = {
  open: boolean;
  code: string;
  title: string;
  event: string;
  message: string;
  retrying?: boolean;
  onRetry: () => void;
  onInstantSave?: () => void;
  errorReportId?: string;
  sessionId?: string;
  adminContent?: ReactNode;
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

export default function SystemErrorDialog({
  open,
  code,
  title,
  event,
  message,
  retrying = false,
  onRetry,
  onInstantSave,
  errorReportId,
  sessionId,
  adminContent,
}: SystemErrorDialogProps) {
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [authenticating, setAuthenticating] = useState(false);

  const titleClickTimes = useRef<number[]>([]);

  if (!open) {
    return null;
  }

  const handleTitleClick = () => {
    const now = Date.now();

    titleClickTimes.current = [
      ...titleClickTimes.current.filter((time) => now - time < 1200),
      now,
    ];

    if (titleClickTimes.current.length >= 3) {
      titleClickTimes.current = [];
      setShowAdminLogin(true);
      setAdminError("");
    }
  };

  const authenticateAdmin = async (): Promise<AdminAuthResult> => {
    if (!adminUsername.trim() || !adminPassword) {
      return {
        success: false,
        message: "管理者IDとパスワードを入力してください。",
      };
    }

    const response = await fetch("/admin/re-auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: adminUsername.trim(),
        password: adminPassword,
        errorReportId,
        sessionId,
        route: window.location.pathname,
      }),
    });

    const data: unknown = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: getMessage(data, "管理者認証に失敗しました。"),
      };
    }

    return {
      success: true,
    };
  };

  const handleAdminAuthentication = async () => {
    setAuthenticating(true);
    setAdminError("");

    try {
      const result = await authenticateAdmin();

      if (!result.success) {
        setAdminError(result.message ?? "管理者認証に失敗しました。");
        return;
      }

      setAdminAuthenticated(true);
      setAdminPassword("");
    } catch {
      setAdminError("管理者認証中に通信エラーが発生しました。");
    } finally {
      setAuthenticating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4">
      <section
        className="w-full max-w-lg rounded-3xl bg-white p-6 text-slate-900 shadow-2xl sm:p-8"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="system-error-title"
      >
        <button
          id="system-error-title"
          type="button"
          onClick={handleTitleClick}
          className="cursor-default text-left text-xl font-bold text-red-600 sm:text-2xl"
        >
          システムエラー
        </button>

        <h2 className="mt-3 text-2xl font-bold sm:text-3xl">{title}</h2>

        <dl className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm sm:text-base">
          <div>
            <dt className="font-semibold text-slate-500">エラーコード</dt>
            <dd className="mt-1 break-all font-mono font-bold text-slate-900">
              {code}
            </dd>
          </div>

          <div>
            <dt className="font-semibold text-slate-500">エラー事象</dt>
            <dd className="mt-1 font-medium text-slate-900">{event}</dd>
          </div>

          <div>
            <dt className="font-semibold text-slate-500">状況</dt>
            <dd className="mt-1 leading-6 text-slate-700">{message}</dd>
          </div>
        </dl>

        {!adminAuthenticated && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700 disabled:bg-slate-400"
            >
              {retrying ? "再試行中…" : "再試行する"}
            </button>

            {onInstantSave && (
              <button
                type="button"
                onClick={onInstantSave}
                disabled={retrying}
                className="rounded-xl bg-amber-500 px-4 py-3 font-bold text-white hover:bg-amber-600 disabled:bg-slate-400"
              >
                インスタント保存
              </button>
            )}
          </div>
        )}

        {showAdminLogin && !adminAuthenticated && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-lg font-bold">管理者認証</h3>

            <p className="mt-1 text-sm text-slate-600">
              このエラーへの管理者対応を表示します。
            </p>

            <input
              className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
              value={adminUsername}
              onChange={(event) => setAdminUsername(event.target.value)}
              placeholder="管理者ID"
              autoComplete="username"
            />

            <input
              type="password"
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder="管理者パスワード"
              autoComplete="current-password"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleAdminAuthentication();
                }
              }}
            />

            {adminError && (
              <p className="mt-3 text-sm font-semibold text-red-600">
                {adminError}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleAdminAuthentication()}
              disabled={authenticating}
              className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 font-bold text-white hover:bg-slate-700 disabled:bg-slate-400"
            >
              {authenticating ? "認証中…" : "認証して対応を開く"}
            </button>
          </div>
        )}

        {adminAuthenticated && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-bold text-emerald-800">管理者認証済み</p>

            <div className="mt-4">
              {adminContent ?? (
                <p className="text-sm leading-6 text-slate-700">
                  管理者認証を記録しました。詳細なレポート確認は管理画面の
                  「エラーレポート」から行えます。
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}