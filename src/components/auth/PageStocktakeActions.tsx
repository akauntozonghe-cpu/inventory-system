"use client";
import { useEffect, useState } from "react";
import { fetchFresh } from "@/lib/fetch-fresh";
import ReopenStocktakeButton from "@/components/stocktake/ReopenStocktakeButton";
export default function PageStocktakeActions({sessionId}:{sessionId:string}) {
  const [session,setSession]=useState<{title:string;status:string}|null>(null);
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;void fetchFresh(`/api/stocktake/session/${encodeURIComponent(sessionId)}/progress`).then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.message||"棚卸状態を確認できません。");if(active)setSession(value.session);}).catch(error=>{if(active)setError(error.message);});return()=>{active=false;};},[sessionId]);
  const change=async(action:string)=>{setBusy(true);setError("");try{const response=await fetchFresh(`/api/stocktake/session/${encodeURIComponent(sessionId)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});const result=await response.json();if(!response.ok)throw new Error(result.message||"棚卸状態を変更できません。");setSession(result.session);}catch(error){setError(error instanceof Error?error.message:"棚卸状態を変更できません。");}finally{setBusy(false);}};
  return <section className="grid gap-3">{error&&<p role="alert">STOCKTAKE_ADMIN_ACTION：{error}</p>}{session&&<><p className="font-bold">{session.title}</p>{session.status==="IN_PROGRESS"&&<button disabled={busy} className="rounded-xl border p-3 font-bold" onClick={()=>void change("PAUSE")}>この棚卸を中断する</button>}{session.status==="PAUSED"&&<button disabled={busy} className="rounded-xl border p-3 font-bold" onClick={()=>void change("RESUME")}>この棚卸を再開する</button>}<ReopenStocktakeButton sessionId={sessionId} status={session.status}/></>}</section>;
}
