"use client";

import { useEffect } from "react";

type Props = {
  message: string;
  tone?: "error" | "success" | "info";
  title?: string;
  onClose?: () => void;
  autoCloseMs?: number;
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
}: Props) {
  useEffect(() => {
    if (!message || !onClose || !autoCloseMs) return;
    const timer = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, message, onClose]);

  if (!message) return null;

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
