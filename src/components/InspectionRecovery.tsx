"use client";
import { useState } from "react";
import { inspectionGuidance } from "@/lib/inspection-guidance";
import { applyAppUpdate } from "@/lib/pwa-update";
import { hasUnsavedWork } from "@/lib/navigation-draft";
import DeviceNotifications from "./pwa/DeviceNotifications";
import InspectionTargets, { hasInspectionTargets } from "./InspectionTargets";

/** Shared by the report wizard and inspection history. Repairs stay with their target. */
export default function InspectionRecovery({checkCode,runId,onChanged,onNavigate,onExecuting}:{checkCode:string;runId:string;onChanged:()=>void|Promise<void>;onNavigate?:()=>void;onExecuting?:()=>void}) {
  const guide = inspectionGuidance(checkCode);
  const [busy,setBusy]=useState(false), [message,setMessage]=useState(""), [failed,setFailed]=useState(false);
  async function update() {
    if(busy)return;
    onExecuting?.();
    setBusy(true);setFailed(false);setMessage("");
    try {
      if(hasUnsavedWork())throw new Error("PWA_UPDATE_UNSAVED：元の画面で入力を保存してから更新してください。");
      if(!navigator.onLine)throw new Error("PWA_UPDATE_OFFLINE：通信が戻ってから更新してください。");
      const reload=()=>{if(hasUnsavedWork())throw new Error("PWA_UPDATE_UNSAVED：入力を保存してください。");window.location.reload();};
      if("serviceWorker" in navigator)await applyAppUpdate(navigator.serviceWorker,reload,setMessage);else reload();
    } catch(error) {setFailed(true);setMessage(error instanceof Error?error.message:"PWA_UPDATE_FAILED：更新できませんでした。入力を残したまま、もう一度お試しください。");}
    finally{setBusy(false);}
  }
  return <section className="my-3 space-y-3" aria-label="この項目の復旧手順">
    <p className="font-bold">何が問題か：{guide.meaning}</p>
    <ol className="list-decimal space-y-2 pl-5 text-sm">{guide.steps.map(step=><li key={step}>{step}</li>)}</ol>
    {hasInspectionTargets(checkCode)?<div onClickCapture={event=>{if((event.target as HTMLElement).closest("button"))onExecuting?.();}}><InspectionTargets checkCode={checkCode} runId={runId} onChanged={onChanged} onNavigate={onNavigate}/></div>:<>
      {guide.kind==="notifications"&&<DeviceNotifications/>}
      {guide.kind==="update"&&<button disabled={busy} className="rounded-xl bg-blue-700 p-3 font-bold text-white disabled:opacity-50" onClick={()=>void update()}>{busy?"更新中…":"保存済みの内容を確認してアプリを更新"}</button>}
      {message&&<p role={failed?"alert":"status"} className="break-words">{message}</p>}
      <button disabled={busy} className="rounded-xl border p-3 font-bold disabled:opacity-50" onClick={async()=>{setBusy(true);try{await onChanged();}finally{setBusy(false);}}}>処置後の状態を再チェック</button>
    </>}
  </section>;
}
