"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { consumeLoginInstallNotice, hasRelatedPwa, isPwaRemembered, isStandalonePwa, pwaInstallInstructions, rememberPwaInstalled, shouldOfferPwaInstall } from "@/lib/pwa-install";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export default function PwaManager() {
  const pathname = usePathname();
  const promptRef = useRef<InstallEvent | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const noticeVersion = useRef(0);
  const loginNoticeActive = useRef(false);
  const [canInstall, setCanInstall] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState("");
  const [installedView, setInstalledView] = useState(false);
  const [online, setOnline] = useState(true);
  const [worker, setWorker] = useState<ServiceWorker | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [setupError, setSetupError] = useState("");

  const closeInstall = useCallback(() => { loginNoticeActive.current = false; noticeVersion.current++; setInstallOpen(false); }, []);
  const install = useCallback(async () => {
    loginNoticeActive.current = false;
    noticeVersion.current++;
    setInstallOpen(true);
    const standalone = isStandalonePwa();
    setInstalledView(standalone);
    if (standalone) { rememberPwaInstalled(true); setGuide("この端末では、すでにホーム画面のアプリとして起動しています。"); return; }
    setGuide(pwaInstallInstructions());
    const event = promptRef.current;
    if (!event) return;
    promptRef.current = null; setCanInstall(false); setBusy(true);
    try {
      // Invoke synchronously within the button click to retain user activation.
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") { setGuide("追加を受け付けました。ホーム画面・アプリ一覧の「在庫管理」から起動してください。"); }
      else setGuide(`追加はキャンセルされました。${pwaInstallInstructions()}`);
    } catch { setGuide(`追加画面を開けませんでした。${pwaInstallInstructions()}`); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const network = () => setOnline(navigator.onLine);
    const ready = (event: Event) => {
      event.preventDefault(); promptRef.current = event as InstallEvent; setCanInstall(true);
      if (!isStandalonePwa()) rememberPwaInstalled(false);
      if (loginNoticeActive.current && !isStandalonePwa()) {
        setInstalledView(false); setGuide("この端末のホーム画面に在庫管理を追加できます。"); setInstallOpen(true);
      }
    };
    const installed = () => { loginNoticeActive.current = false; rememberPwaInstalled(true); noticeVersion.current++; promptRef.current = null; setCanInstall(false); setInstallOpen(false); };
    const request = () => { void install(); };
    const display = window.matchMedia("(display-mode: standalone)");
    const modeChanged = () => { if (isStandalonePwa()) installed(); };
    modeChanged();
    display.addEventListener("change", modeChanged);
    window.addEventListener("online", network); window.addEventListener("offline", network);
    window.addEventListener("beforeinstallprompt", ready); window.addEventListener("appinstalled", installed);
    window.addEventListener("inventory-install-request", request);
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
      }).catch(() => { if (active) setSetupError("アプリの準備に失敗しました。通信を確認し、この画面を開き直してください。"); });
    }
    return () => {
      active = false; display.removeEventListener("change", modeChanged);
      window.removeEventListener("online", network); window.removeEventListener("offline", network);
      window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", installed);
      window.removeEventListener("inventory-install-request", request);
    };
  }, [install]);

  useEffect(() => {
    if (pathname === "/login") { loginNoticeActive.current = false; noticeVersion.current++; setInstallOpen(false); return; }
    if (!consumeLoginInstallNotice()) return;
    loginNoticeActive.current = true;
    const version = ++noticeVersion.current;
    void (async () => {
      const relatedInstalled = await hasRelatedPwa();
      if (version !== noticeVersion.current) return;
      const standalone = isStandalonePwa();
      if (standalone || relatedInstalled) rememberPwaInstalled(true);
      if (!shouldOfferPwaInstall({ standalone, relatedInstalled, installable: Boolean(promptRef.current), remembered: isPwaRemembered() })) return;
      setInstalledView(false);
      setGuide(`ホーム画面に追加すると、アイコンからすぐに起動できます。${pwaInstallInstructions()}`);
      setInstallOpen(true);
    })();
  }, [pathname]);

  useEffect(() => {
    if (installOpen && !dialogRef.current?.open) dialogRef.current?.showModal();
    if (!installOpen && dialogRef.current?.open) dialogRef.current.close();
  }, [installOpen]);
  const showUpdate = Boolean(worker) && !updateDismissed;
  return <>
    <dialog ref={dialogRef} aria-labelledby="pwa-install-title" onCancel={event => { event.preventDefault(); if (!busy) closeInstall(); }} className="m-auto max-h-[90dvh] w-[min(94vw,34rem)] overflow-y-auto rounded-2xl p-6 text-slate-950 shadow-2xl backdrop:bg-slate-950/60">
      <h2 id="pwa-install-title" className="text-2xl font-black">ホーム画面に追加</h2>
      <p className="my-4 leading-7">{guide}</p>
      {setupError && <p role="alert" className="my-3 rounded-xl bg-amber-50 p-3 text-amber-900">{setupError}</p>}
      <div className="flex flex-wrap gap-3">
        {!installedView && <button disabled={busy} onClick={() => void install()} className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "追加を確認中…" : canInstall ? "この端末に追加する" : "この端末での追加方法を確認"}</button>}
        <button disabled={busy} onClick={closeInstall} className="rounded-xl border px-5 py-3 font-bold">{installedView ? "閉じる" : "あとで"}</button>
        {!installedView && <button disabled={busy} onClick={() => { rememberPwaInstalled(true); closeInstall(); }} className="rounded-xl border px-5 py-3 font-bold">この端末には追加済み</button>}
        <Link href="/install" onClick={closeInstall} className="px-2 py-3 font-bold text-blue-700 underline">詳しい手順</Link>
      </div>
    </dialog>
    {(!online || showUpdate) && <aside role="status" className="fixed bottom-4 right-4 z-[100] w-[calc(100%-2rem)] max-w-md rounded-2xl border bg-white p-5 text-slate-950 shadow-xl">
      <p className="font-bold">{!online ? "オフラインです" : "更新できます"}</p>
      <p className="my-3 text-sm">{!online ? "通信が戻るまで他端末の変更は取得できません。" : "入力内容を保存してから更新してください。"}</p>
      {online && <div className="flex gap-3"><button className="rounded-lg bg-blue-700 px-4 py-2 text-white" onClick={() => { navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true }); worker?.postMessage({ type: "SKIP_WAITING" }); }}>更新</button><button className="rounded-lg border px-4 py-2" onClick={() => setUpdateDismissed(true)}>あとで</button></div>}
    </aside>}
  </>;
}
