"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Native modal provides focus containment, Escape handling and focus restoration. */
export default function Modal({ titleId, children, onClose, busy = false, className = "" }: {
  titleId: string; children: ReactNode; onClose: () => void; busy?: boolean; className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => {
      element?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className={`m-auto max-h-[90dvh] w-[min(95vw,42rem)] overflow-y-auto overscroll-contain rounded-3xl bg-white p-5 text-slate-950 shadow-2xl backdrop:bg-slate-950/70 sm:p-6 ${className}`}>
    {children}
  </dialog>;
}
