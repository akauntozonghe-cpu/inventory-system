"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function PwaManager() {
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [iosInstallGuide, setIosInstallGuide] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIosInstallGuide(ios && !standalone);
    setDismissed(sessionStorage.getItem("pwa-guide-dismissed") === "yes");
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
          worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) setWaitingWorker(worker); });
        });
      }).catch((error) => console.error("PWA_SERVICE_WORKER_REGISTRATION_FAILED", error));
    }
    return () => { window.removeEventListener("online", onlineHandler); window.removeEventListener("offline", offlineHandler); window.removeEventListener("beforeinstallprompt", installHandler); };
  }, []);

  const install = async () => { if (!installPrompt) return; await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === "accepted") setDismissed(true); setInstallPrompt(null); };
  const update = () => { if (!waitingWorker) return; waitingWorker.postMessage({ type: "SKIP_WAITING" }); navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true }); };
  const dismiss = () => { sessionStorage.setItem("pwa-guide-dismissed", "yes"); setDismissed(true); };

  const showInstall = online && !waitingWorker && !dismissed && (Boolean(installPrompt) || iosInstallGuide);
  if (online && !waitingWorker && !showInstall) return null;

  const tone = !online ? "from-rose-600 to-orange-500" : waitingWorker ? "from-blue-600 to-cyan-500" : "from-violet-600 to-fuchsia-500";
  return <aside className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl overflow-hidden rounded-[1.75rem] border border-white/20 bg-slate-950 text-white shadow-[0_24px_80px_rgba(15,23,42,.45)]" role="status">
    <div className={`h-1.5 bg-gradient-to-r ${tone}`} />
    <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
      <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${tone} shadow-lg`}><img src="/pwa-icon.svg" alt="" className="h-11 w-11 rounded-xl" /></div>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[10px] font-black tracking-[.22em] text-cyan-300">INVENTORY OS</span><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" /></div><p className="mt-1 text-lg font-black">{!online ? "通信が切断されました" : waitingWorker ? "最新版の準備ができました" : "アプリとして持ち歩く"}</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-300">{!online ? "画面は保持しています。登録・更新はオンライン復帰後に安全に確定します。" : waitingWorker ? "入力中の内容を保存してから、最新版へ切り替えてください。" : iosInstallGuide ? "共有ボタン →「ホーム画面に追加」で専用アプリのように起動できます。" : "ホーム画面から一瞬で起動。ブラウザのURL欄も表示されません。"}</p></div>
      <div className="ml-auto flex items-center gap-2">
        {waitingWorker && <button onClick={update} className="rounded-xl bg-white px-4 py-2.5 font-black text-slate-950 shadow-lg transition hover:-translate-y-0.5">今すぐ更新</button>}
        {!waitingWorker && installPrompt && online && <button onClick={() => void install()} className="rounded-xl bg-white px-4 py-2.5 font-black text-violet-800 shadow-lg transition hover:-translate-y-0.5">インストール</button>}
        {!waitingWorker && iosInstallGuide && online && <Link href="/install" className="rounded-xl bg-white px-4 py-2.5 font-black text-violet-800">手順を見る</Link>}
        {showInstall && <button onClick={dismiss} aria-label="閉じる" className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-xl font-bold hover:bg-white/20">×</button>}
      </div>
    </div>
  </aside>;
}

