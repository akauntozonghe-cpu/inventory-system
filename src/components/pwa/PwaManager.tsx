"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function PwaManager() {
  const pathname = usePathname();
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [iosInstallGuide, setIosInstallGuide] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIosInstallGuide(ios && !standalone);
    setDismissed(localStorage.getItem("pwa-guide-dismissed") === "yes");
    setUpdateDismissed(sessionStorage.getItem("pwa-update-dismissed") === "yes");
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    const installHandler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); setDismissed(false); };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener("beforeinstallprompt", installHandler);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
        if (registration.waiting) setWaitingWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) { setUpdateDismissed(false); setWaitingWorker(worker); } });
        });
      }).catch((error) => console.error("PWA_SERVICE_WORKER_REGISTRATION_FAILED", error));
    }
    return () => { window.removeEventListener("online", onlineHandler); window.removeEventListener("offline", offlineHandler); window.removeEventListener("beforeinstallprompt", installHandler); };
  }, []);

  const install = async () => { if (!installPrompt) return; await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === "accepted") setDismissed(true); setInstallPrompt(null); };
  const update = () => { if (!waitingWorker) return; waitingWorker.postMessage({ type: "SKIP_WAITING" }); navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true }); };
  const dismiss = () => { localStorage.setItem("pwa-guide-dismissed", "yes"); setDismissed(true); };
  const dismissUpdate = () => { sessionStorage.setItem("pwa-update-dismissed", "yes"); setUpdateDismissed(true); };

  const showUpdate = online && Boolean(waitingWorker) && !updateDismissed;
  const showInstall = pathname === "/install" && online && !showUpdate && !dismissed && (Boolean(installPrompt) || iosInstallGuide);
  if (online && !showUpdate && !showInstall) return null;

  return <aside className="fixed bottom-4 right-4 z-[100] w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-4 text-slate-950 shadow-[0_18px_55px_rgba(15,23,42,.18)]" role="status">
    <div className="flex items-start gap-3">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${!online ? "bg-rose-500" : showUpdate ? "bg-blue-500" : "bg-emerald-500"}`} />
      <div className="min-w-0 flex-1"><p className="font-bold">{!online ? "オフラインです" : showUpdate ? "更新できます" : "ホーム画面に追加"}</p><p className="mt-1 text-sm leading-6 text-slate-600">{!online ? "入力内容は保持します。通信が戻ってから登録・更新してください。" : showUpdate ? "作業内容を保存してから最新版へ切り替えてください。" : iosInstallGuide ? "共有メニューから「ホーム画面に追加」を選んでください。" : "この端末へアプリとして追加できます。"}</p></div>
      <div className="ml-auto flex items-center gap-2">
        {showUpdate && <button onClick={update} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white">更新</button>}
        {!showUpdate && installPrompt && online && <button onClick={() => void install()} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white">追加</button>}
        {!showUpdate && iosInstallGuide && online && <Link href="/install" className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white">手順</Link>}
        {(showInstall || showUpdate) && <button onClick={showUpdate ? dismissUpdate : dismiss} aria-label="閉じる" className="grid h-9 w-9 place-items-center rounded-xl text-xl text-slate-500 hover:bg-slate-100">×</button>}
      </div>
    </div>
  </aside>;
}
