"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const WARNING_MS = 60 * 1000;
const ACTIVITY_KEY = "inventory:last-activity";
const PUBLIC_PATHS = new Set(["/login", "/setup", "/maintenance"]);

export default function IdleSessionGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const lastWriteRef = useRef(0);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (PUBLIC_PATHS.has(pathname)) {
      setRemainingSeconds(null);
      return;
    }

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastWriteRef.current < 10_000) return;
      lastWriteRef.current = now;
      localStorage.setItem(ACTIVITY_KEY, String(now));
      setRemainingSeconds(null);
    };

    const logout = async () => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      try { await fetch("/api/auth/logout", { method: "POST" }); }
      finally { localStorage.removeItem(ACTIVITY_KEY); router.replace("/login?reason=idle"); router.refresh(); }
    };

    const check = () => {
      const saved = Number(localStorage.getItem(ACTIVITY_KEY));
      const lastActivity = Number.isFinite(saved) && saved > 0 ? saved : Date.now();
      const remaining = IDLE_LIMIT_MS - (Date.now() - lastActivity);
      if (remaining <= 0) void logout();
      else if (remaining <= WARNING_MS) setRemainingSeconds(Math.max(1, Math.ceil(remaining / 1000)));
      else setRemainingSeconds(null);
    };

    if (!localStorage.getItem(ACTIVITY_KEY)) recordActivity();
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    window.addEventListener("storage", check);
    const timer = window.setInterval(check, 5_000);
    check();
    return () => { events.forEach((event) => window.removeEventListener(event, recordActivity)); window.removeEventListener("storage", check); window.clearInterval(timer); };
  }, [pathname, router]);

  if (remainingSeconds === null) return null;
  return <div className="fixed inset-x-4 top-4 z-[100] mx-auto max-w-lg rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-xl" role="alert"><p className="font-black">まもなく自動ログアウトします</p><p className="mt-1 text-sm">無操作状態が続いています。あと約{remainingSeconds}秒です。画面を操作すると延長されます。</p><button type="button" onClick={() => { const now = Date.now(); localStorage.setItem(ACTIVITY_KEY, String(now)); lastWriteRef.current = now; setRemainingSeconds(null); }} className="mt-3 rounded-xl bg-amber-700 px-4 py-2 font-bold text-white">ログインを延長</button></div>;
}
