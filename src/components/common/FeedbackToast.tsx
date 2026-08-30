"use client";

import { useEffect } from "react";
import Link from "next/link";
import { extractErrorCode, getErrorGuidance } from "@/lib/error-guidance";

type Props = {
  message: string;
  tone?: "error" | "success" | "info";
  title?: string;
  onClose?: () => void;
  autoCloseMs?: number;
  errorCode?: string;
  action?: string;
  recoveryStatus?: "RECOVERING" | "RECOVERED" | "ADMIN_REQUIRED";
  reportId?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
};

const styles = {
  error: "border-red-300 bg-red-50 text-red-950",
  success: "border-emerald-300 bg-emerald-50 text-emerald-950",
  info: "border-blue-300 bg-blue-50 text-blue-950",
};

export default function FeedbackToast({
  message,
  tone = "info",
  title,
  onClose,
  autoCloseMs,
  errorCode,
  action,
  recoveryStatus,
  reportId,
  onRetry,
  retrying = false,
}: Props) {
  useEffect(() => {
    if (!message || !onClose || !autoCloseMs) return;
    const timer = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, message, onClose]);

  if (!message) return null;

  const code = tone === "error" ? errorCode ?? extractErrorCode(message) : "";
  const guidance = tone === "error" ? getErrorGuidance(code) : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[200] flex justify-center px-3 sm:top-5">
      <section
        role={tone === "error" ? "alert" : "status"}
        aria-live={tone === "error" ? "assertive" : "polite"}
        className={`pointer-events-auto w-full max-w-2xl rounded-2xl border-2 p-4 shadow-2xl ${styles[tone]}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <p className="font-black">{title}</p>}
            <p className={title ? "mt-1 font-semibold" : "font-bold"}>{message}</p>
            {tone === "error" && guidance && (
              <div className="mt-3 space-y-2 rounded-xl bg-white/75 p-3 text-sm">
                <p><span className="font-black">エラーコード：</span><code className="break-all">{code}</code></p>
                <p><span className="font-black">今すぐ行うこと：</span>{action ?? guidance.action}</p>
                <p className="font-bold">
                  復旧状況：{recoveryStatus === "RECOVERING" ? "自動復旧中" : recoveryStatus === "RECOVERED" ? "自動復旧済み" : recoveryStatus === "ADMIN_REQUIRED" ? "自動復旧できませんでした。認証後の復旧が必要です" : "自動復旧を開始できる状態です"}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {onRetry && <button type="button" onClick={onRetry} disabled={retrying} className="rounded-lg bg-blue-700 px-3 py-2 font-black text-white disabled:bg-slate-400">{retrying ? "自動復旧中…" : "今すぐ自動復旧"}</button>}
                  {(recoveryStatus === "ADMIN_REQUIRED" || !onRetry) && <Link href={`${guidance.recoveryRoute}${reportId ? `?reportId=${encodeURIComponent(reportId)}` : ""}`} className="rounded-lg bg-slate-900 px-3 py-2 font-black text-white">復旧手順を開く</Link>}
                </div>
              </div>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg bg-white/80 px-3 py-2 text-sm font-black text-slate-800 shadow-sm"
              aria-label="通知を閉じる"
            >
              閉じる
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
