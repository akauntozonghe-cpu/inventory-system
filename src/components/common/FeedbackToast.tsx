"use client";

import { useEffect } from "react";
import { extractErrorCode } from "@/lib/error-guidance";

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
}: Props) {
  useEffect(() => {
    if (!message || !onClose || !autoCloseMs) return;
    const timer = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, message, onClose]);

  if (!message) return null;

  const code = tone === "error" ? errorCode ?? extractErrorCode(message) : "";


  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[200] flex justify-center sm:inset-x-auto sm:bottom-5 sm:right-5">
      <section
        data-admin-recovery-title={tone === "error" ? "true" : undefined}
        role={tone === "error" ? "alert" : "status"}
        aria-live={tone === "error" ? "assertive" : "polite"}
        className={`pointer-events-auto w-full max-w-xl rounded-2xl border p-4 shadow-[0_20px_60px_rgba(16,24,40,.18)] sm:min-w-[380px] ${styles[tone]}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <p data-admin-recovery-title={tone === "error" ? "true" : undefined} className="font-black">{title}</p>}
            <p className={title ? "mt-1 font-semibold" : "font-bold"}>{message}</p>
            {tone === "error" && <p className="mt-2 break-all text-sm">エラーコード：{code}</p>}
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
