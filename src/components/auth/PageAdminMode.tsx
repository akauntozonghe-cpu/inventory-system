"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import AdminModeDialog from "@/components/stocktake/AdminModeDialog";
import RecoveryWizard from "@/components/RecoveryWizard";
import PageStocktakeActions from "./PageStocktakeActions";
import {readRecoveryReturn, type RecoveryReturn} from "@/lib/recovery-return";
import { fetchFresh } from "@/lib/fetch-fresh";
type Intent = "page" | "recovery";
const Context = createContext({active:false,isAdmin:false,open:()=>{}});
export const useAdminMode = () => useContext(Context);
const publicPaths = new Set(["/login","/setup","/install","/offline"]);
export default function PageAdminMode({children}:{children:ReactNode}) {
  const pathname=usePathname();
  const [expiresAt,setExpiresAt]=useState(0),[role,setRole]=useState("");
  const [authOpen,setAuthOpen]=useState(false),[view,setView]=useState<Intent|null>(null),[error,setError]=useState("");
  const [lastFailure,setLastFailure]=useState<{code:string;message:string}|null>(null);
  const [recoveryContext,setRecoveryContext]=useState<RecoveryReturn|null>(null);
  const intent=useRef<Intent>("page");
  const isAdmin=role==="ADMIN",active=isAdmin||expiresAt>0;
  const show=useCallback((next:Intent="page")=>{setError("");intent.current=next;if(role==="ADMIN"||expiresAt>Date.now())setView(next);else setAuthOpen(true);},[role,expiresAt]);
  const showRef=useRef(show);useEffect(()=>{showRef.current=show;},[show]);
  useEffect(()=>{const resume=()=>{const value=readRecoveryReturn();if(value){setRecoveryContext(value);showRef.current("recovery");}};window.addEventListener("inventory:resume-recovery",resume);return()=>window.removeEventListener("inventory:resume-recovery",resume);},[]);
  useEffect(()=>{
    setView(null);setLastFailure(null);setRecoveryContext(null);
    if(publicPaths.has(pathname))return;
    let cancelled=false;
    const check=async()=>{try{const response=await fetchFresh("/admin/re-auth");const value=response.ok?await response.json():null;if(!cancelled){setRole(value?.role||"");setExpiresAt(value?.expiresAt>Date.now()?value.expiresAt:0);}}catch{if(!cancelled){setRole("");setExpiresAt(0);}}};
    void check();window.addEventListener("focus",check);
    let count=0,last=0,target:Element|null=null;
    const click=(event:MouseEvent)=>{const title=(event.target as Element)?.closest?.("[data-admin-recovery-title], h1");if(!title)return;const now=Date.now();count=target===title&&now-last<900?count+1:1;last=now;target=title;if(count===3){count=0;setRecoveryContext(null);const source=title.closest("[data-error-code]");if(source)setLastFailure({code:source.getAttribute("data-error-code")||"UNKNOWN",message:source.getAttribute("data-error-message")||""});showRef.current(title.hasAttribute("data-admin-recovery-title")?"recovery":"page");}};
    const failure=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.code&&value?.message)setLastFailure(value);};
    document.addEventListener("click",click);window.addEventListener("inventory:recovery-failed",failure);
    return()=>{cancelled=true;window.removeEventListener("focus",check);document.removeEventListener("click",click);window.removeEventListener("inventory:recovery-failed",failure);};
  },[pathname]);
  useEffect(()=>{if(!expiresAt||isAdmin)return;const timer=setTimeout(()=>{setExpiresAt(0);setView(null);},Math.max(0,expiresAt-Date.now()));return()=>clearTimeout(timer);},[expiresAt,isAdmin]);
  const exit=async()=>{try{const response=await fetchFresh("/admin/re-auth",{method:"DELETE"});if(!response.ok)throw new Error();setExpiresAt(0);setView(null);}catch{setError("ADMIN_EXIT_FAILED：一時的な操作許可を終了できませんでした。");}};
  const stocktake=pathname.match(/^\/stocktake\/([^/]+)(?:\/result)?$/);
  const stocktakeId=stocktake&&!['start','history'].includes(stocktake[1])?stocktake[1]:null;
  const catalog=pathname.startsWith("/items");
  return <Context.Provider value={{active,isAdmin,open:()=>show("page")}}>{children}
    <AdminModeDialog open={authOpen} sessionId={stocktakeId||""} purpose="このページの保護された操作・復旧を有効にします。" onClose={()=>setAuthOpen(false)} onAuthenticated={()=>{setExpiresAt(Date.now()+600000);setAuthOpen(false);setView(intent.current);}}/>
    {view&&active&&<div className="fixed inset-0 z-[300] overflow-auto bg-slate-950/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="page-admin-title" className="mx-auto my-5 w-full max-w-3xl rounded-2xl bg-white p-5 text-slate-950"><header className="mb-4 flex items-start justify-between gap-3"><h2 id="page-admin-title" className="text-xl font-black">{view==="recovery"?"診断・復旧":"このページの操作"}</h2><button className="rounded-xl border px-3 py-2" onClick={()=>setView(null)}>閉じる</button></header>{error&&<p role="alert">{error}</p>}
      {view==="recovery"?<>{lastFailure&&<p className="mb-3 rounded-xl bg-red-50 p-3">{lastFailure.code}：{lastFailure.message}</p>}<RecoveryWizard contextRoute={recoveryContext?.route??pathname} initialReportId={recoveryContext?.reportId} errorCode={lastFailure?.code} onReturnToWork={()=>setView(null)}/></>:<div className="grid gap-3">
        {pathname==="/marketplace"&&<button className="rounded-xl bg-violet-700 p-3 font-bold text-white" onClick={()=>{setView(null);window.dispatchEvent(new Event("inventory:marketplace-admin"));}}>このページの出品を取消・差戻し</button>}
        {stocktakeId&&<PageStocktakeActions sessionId={stocktakeId}/>}
        {catalog&&<button className="rounded-xl border p-3 font-bold" onClick={()=>setView(null)}>商品・在庫の編集操作へ戻る</button>}
        {pathname==="/admin/classifications"&&<p className="rounded-xl bg-slate-50 p-3">この画面で分類名の変更・統合、商品への分類割当、保管場所の整理を行えます。</p>}
        <button className="rounded-xl border p-3 font-bold" onClick={()=>setView("recovery")}>このページのエラーを診断・復旧</button>
        <button className="rounded-xl border p-3 font-bold" onClick={()=>window.location.reload()}>最新情報を読み直す</button>
        {!isAdmin&&<button className="rounded-xl bg-slate-800 p-3 font-bold text-white" onClick={()=>void exit()}>一時的な操作許可を終了</button>}
      </div>}
    </section></div>}
  </Context.Provider>;
}
