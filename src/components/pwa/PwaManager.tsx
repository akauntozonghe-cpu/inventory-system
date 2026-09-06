"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
export default function PwaManager() {
  const [online, setOnline] = useState(true);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [worker, setWorker] = useState<ServiceWorker | null>(null);
  const [guide, setGuide] = useState("");
  const [dismissed, setDismissed] = useState(true);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  useEffect(() => {
    setOnline(navigator.onLine);
    try { setDismissed(localStorage.getItem("pwa-guide-dismissed") === "yes"); } catch { setDismissed(false); }
    const network = () => setOnline(navigator.onLine);
    const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const installed = () => { setPrompt(null); setGuide(""); setDismissed(true); };
    window.addEventListener("online", network); window.addEventListener("offline", network);
    window.addEventListener("beforeinstallprompt", ready); window.addEventListener("appinstalled", installed);
    let active = true;
    if (window.isSecureContext && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((registration) => {
        if (!active) return;
        if (registration.waiting) setWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const incoming = registration.installing;
          incoming?.addEventListener("statechange", () => {
            if (active && incoming.state === "installed" && navigator.serviceWorker.controller) { setWorker(incoming); setUpdateDismissed(false); }
          });
        });
      }).catch(() => { if (active) setGuide("アプリの準備に失敗しました。通信を確認し、この画面を開き直してください。"); });
    }
    return () => { active = false; window.removeEventListener("online", network); window.removeEventListener("offline", network); window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", installed); };
  }, []);
  const install = useCallback(async () => {
    setDismissed(false);
    if (isInstalled()) { setGuide("この端末では、すでにアプリとして起動しています。"); return; }
    if (!window.isSecureContext) { setGuide("HTTPSの公開URLで開き直してください。HTTPのローカルIPアドレスではアプリとして追加できません。"); return; }
    if (prompt) {
      setPrompt(null);
      try { await prompt.prompt(); const result = await prompt.userChoice; if (result.outcome === "accepted") { setGuide(""); setDismissed(true); return; } }
      catch { /* Browser-menu instructions remain available. */ }
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setGuide(ios ? "Safariの共有メニューを開き、「ホーム画面に追加」を選んでください。" : "Chrome・Edgeのメニューで「アプリをインストール」または「ホーム画面に追加」を選んでください。項目がない場合は外部ブラウザでHTTPSの公開URLを開き、追加済みでないかも確認してください。");
  }, [prompt]);
  useEffect(() => {
    const request = () => { void install(); };
    window.addEventListener("inventory-install-request", request);
    return () => window.removeEventListener("inventory-install-request", request);
  }, [install]);
  const showUpdate = Boolean(worker) && !updateDismissed;
  if (online && !showUpdate && (dismissed || (!prompt && !guide))) return null;
  return <aside role="status" className="fixed bottom-4 right-4 z-[100] w-[calc(100%-2rem)] max-w-md rounded-2xl border bg-white p-5 text-slate-950 shadow-xl">
    <p className="font-bold">{!online ? "オフラインです" : showUpdate ? "更新できます" : "ホーム画面に追加"}</p>
    <p className="my-3 text-sm">{!online ? "通信が戻るまで他端末の変更は取得できません。" : showUpdate ? "入力内容を保存してから更新してください。" : guide || "この端末にアプリとして追加できます。"}</p>
    <div className="flex gap-3">
      {online && showUpdate && <button className="rounded-lg bg-blue-700 px-4 py-2 text-white" onClick={() => { navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true }); worker?.postMessage({ type: "SKIP_WAITING" }); }}>更新</button>}
      {online && !showUpdate && prompt && <button className="rounded-lg bg-blue-700 px-4 py-2 text-white" onClick={() => void install()}>追加</button>}
      {online && !showUpdate && <Link href="/install" className="p-2 underline">詳しい手順</Link>}
      {online && <button className="rounded-lg bg-slate-100 px-4 py-2" onClick={() => { if (showUpdate) setUpdateDismissed(true); else { setDismissed(true); setGuide(""); try { localStorage.setItem("pwa-guide-dismissed", "yes"); } catch {} } }}>閉じる</button>}
    </div>
  </aside>;
}
