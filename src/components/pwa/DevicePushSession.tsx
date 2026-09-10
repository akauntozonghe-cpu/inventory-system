"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ensurePushSubscription, PUSH_ENABLED, supportsDevicePush, pushRegistration, saveDevicePush, detachDevicePush } from "@/lib/device-push-client";
export default function DevicePushSession() {
  const pathname = usePathname();
  useEffect(() => {
    if (!supportsDevicePush()) return;
    if (pathname === "/login") { void detachDevicePush(); return; }
    if (["/setup","/install","/offline","/maintenance"].includes(pathname)) return;
    let stopped = false;
    const reconnect = async () => {
      try {
        if (localStorage.getItem(PUSH_ENABLED) !== "1" || Notification.permission !== "granted") return;
        const response = await fetch("/api/notifications/device", { cache:"no-store",signal:AbortSignal.timeout(8000) });
        if (!response.ok) return; const settings=await response.json();if(!settings.ready||stopped)return;
        const registration = await pushRegistration();if(stopped)return;
        const subscription=await ensurePushSubscription(registration,settings.publicKey);
        if(!stopped)await saveDevicePush(subscription);
      } catch { /* Permission is never requested here. The notifications page offers a test. */ }
    };
    void reconnect(); window.addEventListener("online",reconnect);
    return()=>{stopped=true;window.removeEventListener("online",reconnect);};
  },[pathname]);
  return null;
}
