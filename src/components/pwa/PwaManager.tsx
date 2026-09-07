"use client";
import { useEffect, useState } from "react";
import { isStandalonePwa, rememberPwaInstalled } from "@/lib/pwa-install";

import { captureInstallPrompt, markNativeInstalled, type NativeInstallEvent } from "@/lib/pwa-install-prompt";
export default function PwaManager() {
  const [online, setOnline] = useState(true);
  const [worker, setWorker] = useState<ServiceWorker | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);


  useEffect(() => {
    setOnline(navigator.onLine);
    const network = () => setOnline(navigator.onLine);
    const ready = (event: Event) => { captureInstallPrompt(event as NativeInstallEvent); };
    const installed = () => { rememberPwaInstalled(true); markNativeInstalled(); };
    const display = window.matchMedia("(display-mode: standalone)");
    const modeChanged = () => { if (isStandalonePwa()) installed(); };
    modeChanged();
    display.addEventListener("change", modeChanged);
    window.addEventListener("online", network); window.addEventListener("offline", network);
    window.addEventListener("beforeinstallprompt", ready); window.addEventListener("appinstalled", installed);
    let active = true;
    if (window.isSecureContext && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(registration => {
        if (!active) return;
        if (registration.waiting) setWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const incoming = registration.installing;
          incoming?.addEventListener("statechange", () => {
            if (active && incoming.state === "installed" && navigator.serviceWorker.controller) { setWorker(incoming); setUpdateDismissed(false); }
          });
        });
      }).catch(() => { /* The explicit install diagnostics reports preparation failures. */ });
    }
    return () => {
      active = false; display.removeEventListener("change", modeChanged);
      window.removeEventListener("online", network); window.removeEventListener("offline", network);
      window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const showUpdate = Boolean(worker) && !updateDismissed;
  return <>
    {(!online || showUpdate) && <aside role="status" className="fixed bottom-4 right-4 z-[100] w-[calc(100%-2rem)] max-w-md rounded-2xl border bg-white p-5 text-slate-950 shadow-xl">
      <p className="font-bold">{!online ? "オフラインです" : "更新できます"}</p>
      <p className="my-3 text-sm">{!online ? "通信が戻るまで他端末の変更は取得できません。" : "入力内容を保存してから更新してください。"}</p>
      {online && <div className="flex gap-3"><button className="rounded-lg bg-blue-700 px-4 py-2 text-white" onClick={() => { navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true }); worker?.postMessage({ type: "SKIP_WAITING" }); }}>更新</button><button className="rounded-lg border px-4 py-2" onClick={() => setUpdateDismissed(true)}>あとで</button></div>}
    </aside>}
  </>;
}
