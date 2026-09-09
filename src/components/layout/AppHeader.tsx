"use client";
import RecoveryReturnButton from "@/components/auth/RecoveryReturn";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bell, Menu, X, LogOut, RefreshCw } from "lucide-react";
import { fetchFresh } from "@/lib/fetch-fresh";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { visibleAppMenu } from "@/lib/app-menu";
import { updateDeviceBadge } from "@/lib/device-badge";
import { leaveCurrentStocktakes } from "@/hooks/useStocktakePresence";
import { detachDevicePush } from "@/lib/device-push-client";
import { hasUnsavedWork } from "@/lib/navigation-draft";

type User={displayName:string;role:string;featurePermissions:string[]};
export default function AppHeader({parent}:{parent:{href:string;label:string}}) {
  const pathname=usePathname(),router=useRouter(),drawer=useRef<HTMLDialogElement>(null);
  const [open,setOpen]=useState(false),[user,setUser]=useState<User|null>(null),[unread,setUnread]=useState(0),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const load=async()=>{
    const [authResponse,notificationResponse]=await Promise.all([fetchFresh("/api/auth/me"),fetchFresh("/api/notifications")]);
    if(!authResponse.ok)throw new Error("AUTH_HEADER_FAILED");
    setUser(await authResponse.json());setError("");
    if(notificationResponse.ok){const data=await notificationResponse.json();setUnread(data.unreadCount??0);void updateDeviceBadge(data.unreadCount??0);}else if(notificationResponse.status!==503)throw new Error("NOTIFICATION_HEADER_FAILED");
  };
  useEffect(()=>{void load().catch(()=>setError("MENU_LOAD_FAILED：メニューを読み込めませんでした。"));},[]);
  const stale=useLiveRefresh(load);
  useEffect(()=>{setOpen(false);},[pathname]);
  useEffect(()=>{const close=()=>setOpen(false);window.addEventListener("inventory:close-menu",close);return()=>window.removeEventListener("inventory:close-menu",close);},[]);
  useEffect(()=>{if(open)drawer.current?.showModal();else drawer.current?.close();},[open]);
  const logout=async()=>{
    if(hasUnsavedWork()&&!window.confirm("未保存の入力があります。保存せずにログアウトしますか？"))return;
    setBusy(true);
    try{await leaveCurrentStocktakes();await detachDevicePush();const response=await fetchFresh("/api/auth/logout",{method:"POST"});if(!response.ok)throw new Error("LOGOUT_FAILED");void updateDeviceBadge(0);sessionStorage.removeItem("inventory:recovery-return");router.replace("/login");router.refresh();}
    finally{setBusy(false);}
  };
  return <header className="sticky top-0 z-[60] border-b border-slate-200 bg-white/95 text-slate-950 shadow-sm backdrop-blur print:hidden">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">{pathname!=="/"&&<Link href={parent.href} aria-label={parent.label} title={parent.label} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 hover:bg-slate-100"><ArrowLeft size={21}/></Link>}<span className="truncate font-black tracking-tight">Inventory OS</span></div>
      <div className="flex items-center gap-2"><Link href="/notifications" aria-label={unread?`通知：未読${unread}件`:"通知"} title="通知" className="relative grid h-11 w-11 place-items-center rounded-xl hover:bg-slate-100"><Bell size={23}/>{unread>0&&<span className="absolute right-0 top-0 rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{unread>99?"99+":unread}</span>}</Link><button type="button" aria-label="メニューを開く" aria-expanded={open} aria-controls="app-menu" onClick={()=>setOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl bg-slate-900 text-white"><Menu size={23}/></button></div>
    </div>
    <RecoveryReturnButton/>
    <dialog ref={drawer} id="app-menu" aria-labelledby="app-menu-title" onCancel={event=>{event.preventDefault();setOpen(false);}} onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}} className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-[min(90vw,360px)] max-w-none overflow-y-auto border-l bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/50">
      <div className="flex items-center justify-between border-b p-4"><div><h2 id="app-menu-title" className="text-xl font-black">メニュー</h2><p className="mt-1 text-sm text-slate-500">{user?.displayName??"読み込み中…"}</p></div><button aria-label="メニューを閉じる" onClick={()=>setOpen(false)} className="grid h-11 w-11 place-items-center rounded-xl border"><X size={22}/></button></div>
      <nav aria-label="共通メニュー" className="space-y-4 p-4">{user&&visibleAppMenu(user).map(group=><section key={group.title}><h3 className="mb-1 px-3 text-xs font-bold text-slate-500">{group.title}</h3>{group.links.map(link=><Link key={link.href} href={link.href} aria-current={pathname===link.href?"page":undefined} onClick={()=>setOpen(false)} className={`block rounded-xl px-3 py-3 text-sm font-bold ${pathname===link.href?"bg-teal-50 text-teal-900":"hover:bg-slate-100"}`}>{link.label}</Link>)}</section>)}</nav>
      <div className="space-y-2 border-t p-4">{(error||stale)&&<div role="alert" className="text-sm text-red-700">{error||"MENU_SYNC_FAILED：最新情報を確認できませんでした。"}<button className="ml-2 underline" onClick={()=>void load().catch(()=>setError("MENU_LOAD_FAILED：メニューを読み込めませんでした。"))}>再読み込み</button></div>}<button className="flex w-full items-center gap-3 rounded-xl border p-3 font-bold" onClick={()=>{setOpen(false);window.dispatchEvent(new Event("inventory:app-update"));}}><RefreshCw size={18}/>アプリの更新を確認</button><button disabled={busy} className="flex w-full items-center gap-3 rounded-xl p-3 font-bold text-slate-600" onClick={()=>void logout().catch(()=>setError("LOGOUT_FAILED：ログアウトできませんでした。"))}><LogOut size={18}/>{busy?"ログアウト中…":"ログアウト"}</button></div>
    </dialog>
  </header>;
}
