"use client";
import NotificationPermissionLink from "./NotificationPermissionLink";
import { useCallback, useEffect, useRef, useState } from "react";
import { isStandalonePwa, rememberPwaInstalled } from "@/lib/pwa-install";
import { captureInstallPrompt, markNativeInstalled, type NativeInstallEvent } from "@/lib/pwa-install-prompt";
import { applyAppUpdate } from "@/lib/pwa-update";
import { hasUnsavedWork, setUnsavedWork } from "@/lib/navigation-draft";

export default function AppUpdateFooter() {
  const [online,setOnline]=useState(true),[available,setAvailable]=useState(false),[dismissed,setDismissed]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(false);
  const working=useRef(false),panel=useRef<HTMLElement>(null);
  const reload=useCallback(()=>{
    if(hasUnsavedWork())throw new Error("PWA_UPDATE_UNSAVED：入力中の内容を保存してから更新してください。");
    window.location.reload();
  },[]);
  const update=useCallback(async()=>{
    if(working.current)return;
    setDismissed(false);setError(false);
    if(hasUnsavedWork()){setMessage("PWA_UPDATE_UNSAVED：入力中の内容を保存してから更新してください。");setError(true);return;}
    if(!navigator.onLine){setMessage("PWA_UPDATE_OFFLINE：通信が戻ってから更新してください。");setError(true);return;}
    working.current=true;setBusy(true);
    try { if("serviceWorker" in navigator)await applyAppUpdate(navigator.serviceWorker,reload,setMessage);else reload(); }
    catch(error){setMessage(error instanceof Error?error.message:"PWA_UPDATE_FAILED：更新できませんでした。");setError(true);}
    finally{working.current=false;setBusy(false);}
  },[reload]);
  useEffect(()=>{
    let active=true;let registration:ServiceWorkerRegistration|undefined;
    const listeners:Array<()=>void>=[];
    const network=()=>setOnline(navigator.onLine);network();
    const ready=(event:Event)=>captureInstallPrompt(event as NativeInstallEvent);
    const installed=()=>{rememberPwaInstalled(true);markNativeInstalled();};
    const display=window.matchMedia("(display-mode: standalone)");
    const modeChanged=()=>{if(isStandalonePwa())installed();};modeChanged();
    const inspect=()=>{if(active&&registration?.waiting){setAvailable(true);setDismissed(false);}};
    const observe=()=>{inspect();const worker=registration?.installing;if(worker){worker.addEventListener("statechange",inspect);listeners.push(()=>worker.removeEventListener("statechange",inspect));}};
    const wake=()=>{inspect();void registration?.update().then(inspect).catch(()=>{});};
    if(window.isSecureContext&&"serviceWorker" in navigator)void navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"}).then(value=>{if(!active)return;registration=value;observe();registration.addEventListener("updatefound",observe);}).catch(()=>{});
    const request=()=>{void update();};
    window.addEventListener("inventory:app-update",request);window.addEventListener("focus",wake);
    window.addEventListener("online",network);window.addEventListener("offline",network);window.addEventListener("beforeinstallprompt",ready);window.addEventListener("appinstalled",installed);display.addEventListener("change",modeChanged);
    return()=>{active=false;registration?.removeEventListener("updatefound",observe);listeners.forEach(stop=>stop());window.removeEventListener("inventory:app-update",request);window.removeEventListener("focus",wake);window.removeEventListener("online",network);window.removeEventListener("offline",network);window.removeEventListener("beforeinstallprompt",ready);window.removeEventListener("appinstalled",installed);display.removeEventListener("change",modeChanged);};
  },[update]);
  useEffect(()=>{const element=panel.current;if(!element)return;const observer=new ResizeObserver(()=>document.documentElement.style.setProperty("--app-footer-height",`${element.offsetHeight}px`));observer.observe(element);return()=>{observer.disconnect();document.documentElement.style.removeProperty("--app-footer-height");};},[]);
  return <footer ref={panel} className="fixed inset-x-0 bottom-0 z-[65] print:hidden border-t bg-white px-4 py-3 text-sm text-slate-600">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${online?"bg-emerald-500":"bg-amber-500"}`}/>{online?"オンライン":"オフライン：他端末の変更は通信復帰後に反映"}</span><NotificationPermissionLink/></div>
    {!dismissed&&(available||message)&&<section aria-label="アプリの更新" className="mx-auto mt-3 max-w-7xl rounded-xl border bg-slate-50 p-3"><p role={error?"alert":"status"} className="font-bold">{message||"新しいアプリに更新できます"}</p><div className="mt-2 flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void update()} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50">{busy?"更新中…":error?"更新を再試行":"保存してあれば更新"}</button>{error&&message.startsWith("PWA_UPDATE_UNSAVED")&&<button className="rounded-lg border px-3 py-2" onClick={()=>{if(window.confirm("未保存の入力を破棄して更新しますか？")){setUnsavedWork(false);window.dispatchEvent(new CustomEvent("inventory:draft",{detail:{dirty:false}}));void update();}}}>入力を破棄して更新</button>}{error&&<button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>{try{reload();}catch(error){setMessage((error as Error).message);}}}>画面を読み直す</button>}<button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>{setDismissed(true);setMessage("");}}>あとで</button></div></section>}
  </footer>;
}
