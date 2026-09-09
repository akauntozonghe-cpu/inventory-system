"use client";
import { useEffect, useRef } from "react";

// Callers await this before clearing the authentication cookie.
const exits = new Set<() => Promise<unknown>>();
export async function leaveCurrentStocktakes() { await Promise.allSettled([...exits].map(exit => exit())); }

export function useStocktakePresence(sessionId: string, active: boolean, refresh: () => Promise<unknown>) {
  const refreshRef = useRef(refresh); useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => {
    if (!active) return;
    const deviceId = crypto.randomUUID();
    const url = `/api/stocktake/session/${encodeURIComponent(sessionId)}/presence`;
    let stopped = false, running = false;
    const send = (action: string) => fetch(url, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId, action }), signal: AbortSignal.timeout(5000) });
    const heartbeat = async () => {
      if (stopped || running || document.visibilityState === "hidden") return;
      running = true;
      try { const response = await send("HEARTBEAT"); if ([401,403,409].includes(response.status)) { stopped = true; void refreshRef.current().catch(() => {}); } } catch { /* The lease expires if this device cannot reach the server. */ } finally { running = false; }
    };
    const leave = async () => { stopped = true; await send("LEAVE"); };
    const pagehide = () => { void leave().catch(() => {}); };
    const wake = () => { if (document.visibilityState !== "hidden") { stopped = false; void heartbeat(); } };
    exits.add(leave); void heartbeat();
    const timer = setInterval(() => void heartbeat(), 25_000);
    window.addEventListener("pagehide", pagehide); window.addEventListener("pageshow", wake); window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake);
    return () => { stopped = true; clearInterval(timer); exits.delete(leave); window.removeEventListener("pagehide", pagehide); window.removeEventListener("pageshow", wake); window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake); void send("LEAVE").catch(() => {}); };
  }, [sessionId, active]);
}
