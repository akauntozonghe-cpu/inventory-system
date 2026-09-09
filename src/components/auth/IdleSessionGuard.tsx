"use client";
import { leaveCurrentStocktakes } from "@/hooks/useStocktakePresence";
import { detachDevicePush } from "@/lib/device-push-client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const WARNING_MS = 60 * 1000;
import { ACTIVITY_KEY } from "@/lib/session-activity";
const PUBLIC_PATHS = new Set(["/login", "/setup", "/maintenance", "/install", "/offline"]);

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

    loggingOutRef.current = false;
    let memoryActivity = Date.now();
    const recordActivity = () => {
      const now = Date.now();
      if (now - lastWriteRef.current < 10_000) return;
      lastWriteRef.current = now;
      memoryActivity = now;
      try { localStorage.setItem(ACTIVITY_KEY, String(now)); } catch {}
      setRemainingSeconds(null);
    };

    const logout = async () => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      try { await leaveCurrentStocktakes(); await detachDevicePush(); await fetch("/api/auth/logout", { method: "POST" }); }
      finally { try { localStorage.removeItem(ACTIVITY_KEY); } catch {} window.location.replace("/login?reason=idle"); }
    };

    const check = () => {
      let saved = memoryActivity;
      try { saved = Number(localStorage.getItem(ACTIVITY_KEY)) || memoryActivity; } catch {}
      const lastActivity = Number.isFinite(saved) && saved > 0 ? saved : Date.now();
      const remaining = IDLE_LIMIT_MS - (Date.now() - lastActivity);
      if (remaining <= 0) void logout();
      else if (remaining <= WARNING_MS) setRemainingSeconds(Math.max(1, Math.ceil(remaining / 1000)));
      else setRemainingSeconds(null);
    };

    try { if (!localStorage.getItem(ACTIVITY_KEY)) recordActivity(); } catch { recordActivity(); }
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    window.addEventListener("storage", check);
    const ended = () => { void logout(); };
    window.addEventListener("inventory:session-ended", ended);
    const timer = window.setInterval(check, 5_000);
    check();
    return () => { events.forEach((event) => window.removeEventListener(event, recordActivity)); window.removeEventListener("storage", check); window.removeEventListener("inventory:session-ended", ended); window.clearInterval(timer); };
  }, [pathname, router]);

  if (remainingSeconds === null) return null;
  return <div className="fixed inset-x-4 top-4 z-[100] mx-auto max-w-lg rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-xl" role="alert"><p className="font-black">まもなく自動ログアウトします</p><p className="mt-1 text-sm">無操作状態が続いています。あと約{remainingSeconds}秒です。画面を操作すると延長されます。</p><button type="button" onClick={() => { const now = Date.now(); try { localStorage.setItem(ACTIVITY_KEY, String(now)); } catch {} lastWriteRef.current = 0; window.dispatchEvent(new Event("pointerdown")); setRemainingSeconds(null); }} className="mt-3 rounded-xl bg-amber-700 px-4 py-2 font-bold text-white">ログインを延長</button></div>;
}
