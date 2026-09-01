"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function PwaManager() {
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [iosInstallGuide, setIosInstallGuide] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIosInstallGuide(ios && !(navigator as Navigator & { standalone?: boolean }).standalone);
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    const installHandler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener("beforeinstallprompt", installHandler);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
        if (registration.waiting) setWaitingWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) setWaitingWorker(worker); });
        });
      }).catch((error) => console.error("PWA_SERVICE_WORKER_REGISTRATION_FAILED", error));
    }
    return () => { window.removeEventListener("online", onlineHandler); window.removeEventListener("offline", offlineHandler); window.removeEventListener("beforeinstallprompt", installHandler); };
  }, []);

  const install = async () => { if (!installPrompt) return; await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); };
  const update = () => { if (!waitingWorker) return; waitingWorker.postMessage({ type: "SKIP_WAITING" }); navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true }); };

  if (online && !installPrompt && !waitingWorker && !iosInstallGuide) return null;
  return <aside className="fixed inset-x-3 bottom-3 z-[100] mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-slate-950 p-4 text-white shadow-2xl" role="status">
    <div><p className="font-black">{!online ? "オフラインです" : waitingWorker ? "新しいバージョンがあります" : "この端末にインストールできます"}</p><p className="text-xs font-semibold text-slate-300">{!online ? "閲覧中の画面は残ります。登録・更新は通信復旧後に行ってください。" : waitingWorker ? "入力中の内容を保存してから更新してください。" : iosInstallGuide ? "iPhoneは共有ボタンから『ホーム画面に追加』を選んでください。" : "ホーム画面からアプリとして起動できます。"}</p></div>
    {waitingWorker && <button onClick={update} className="rounded-xl bg-blue-600 px-4 py-2 font-black">更新する</button>}
    {!waitingWorker && installPrompt && online && <button onClick={() => void install()} className="rounded-xl bg-emerald-600 px-4 py-2 font-black">インストール</button>}
  </aside>;
}
