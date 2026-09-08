"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import AdminModeDialog from "@/components/stocktake/AdminModeDialog";
import { fetchFresh } from "@/lib/fetch-fresh";
const Context = createContext({active:false,open:()=>{}});
export const useAdminMode = () => useContext(Context);
const publicPaths = new Set(["/login","/setup","/install","/offline"]);
export default function PageAdminMode({children}:{children:ReactNode}) {
  const pathname = usePathname();
  const [expiresAt,setExpiresAt] = useState(0), [role,setRole] = useState("");
  const [authOpen,setAuthOpen] = useState(false), [menuOpen,setMenuOpen] = useState(false), [error,setError] = useState("");
  const active = expiresAt > 0;
  const open = useCallback(()=>{setError("");if(expiresAt > Date.now())setMenuOpen(true);else setAuthOpen(true);},[expiresAt]);
  const openRef = useRef(open);useEffect(()=>{openRef.current=open;},[open]);
  useEffect(()=>{
    if(publicPaths.has(pathname))return;
    let cancelled=false;
    const check=async()=>{try{const response=await fetchFresh("/admin/re-auth");if(!cancelled){if(!response.ok){setExpiresAt(0);return;}const value=await response.json();setRole(value.role);setExpiresAt(value.expiresAt > Date.now() ? value.expiresAt : 0);}}catch{if(!cancelled)setExpiresAt(0);}};
    void check();window.addEventListener("focus",check);
    let count=0,last=0,target:Element|null=null;
    const click=(event:MouseEvent)=>{const title=(event.target as Element)?.closest?.("h1");if(!title || title.closest('[role="dialog"]'))return;const now=Date.now();count=target===title&&now-last<900?count+1:1;target=title;last=now;if(count===3){count=0;openRef.current();}};
    document.addEventListener("click",click);
    return()=>{cancelled=true;window.removeEventListener("focus",check);document.removeEventListener("click",click);};
  },[pathname]);
  useEffect(()=>{if(!expiresAt)return;const timer=setTimeout(()=>{setExpiresAt(0);setMenuOpen(false);},Math.max(0,expiresAt-Date.now()));return()=>clearTimeout(timer);},[expiresAt]);
  const exit=async()=>{try{const response=await fetchFresh("/admin/re-auth",{method:"DELETE"});if(!response.ok)throw new Error();setExpiresAt(0);setMenuOpen(false);}catch{setError("管理者モードを終了できませんでした。再試行してください。");}};
  return <Context.Provider value={{active,open}}>{children}
    {!publicPaths.has(pathname)&&<button type="button" onClick={open} className="fixed bottom-3 right-3 z-40 rounded-full border bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow">{active?"管理者モード中":"管理者操作"}</button>}
    <AdminModeDialog open={authOpen} sessionId="" purpose="このページの管理者操作を有効にします。権限は10分で終了します。" onClose={()=>setAuthOpen(false)} onAuthenticated={()=>{setExpiresAt(Date.now()+600000);setAuthOpen(false);setMenuOpen(true);}}/>
    {menuOpen&&active&&<div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="page-admin-title" className="w-full max-w-lg rounded-2xl bg-white p-6 text-slate-950"><h2 id="page-admin-title" className="text-xl font-black">管理者モード</h2><p className="my-3 text-sm">操作は記録されます。タイトルを3回押すか「管理者操作」から開けます。</p>{error&&<p role="alert">{error}</p>}<div className="grid gap-3">
    {pathname==="/marketplace"&&<button className="rounded-xl bg-violet-700 p-3 font-bold text-white" onClick={()=>{setMenuOpen(false);window.dispatchEvent(new Event("inventory:marketplace-admin"));}}>フリマの取消・差戻し</button>}
    {role==="ADMIN"?<><Link className="rounded-xl border p-3 font-bold" onClick={()=>setMenuOpen(false)} href="/admin/recovery">診断・復旧を開く</Link><Link className="rounded-xl border p-3 font-bold" onClick={()=>setMenuOpen(false)} href="/admin/stocktake">棚卸の再開・確認待ちを管理</Link><Link className="rounded-xl border p-3 font-bold" onClick={()=>setMenuOpen(false)} href="/admin">管理者設定</Link></>:<p className="text-sm text-slate-600">このページの保護された業務操作に使えます。ユーザー管理・システム復旧は管理者アカウントで開いてください。</p>}
    <button onClick={()=>window.location.reload()} className="rounded-xl border p-3 font-bold">最新の状態を読み直す</button><button onClick={()=>setMenuOpen(false)} className="rounded-xl border p-3 font-bold">作業に戻る</button><button onClick={()=>void exit()} className="rounded-xl bg-slate-800 p-3 font-bold text-white">管理者モードを終了</button></div></section></div>}
  </Context.Provider>;
}
