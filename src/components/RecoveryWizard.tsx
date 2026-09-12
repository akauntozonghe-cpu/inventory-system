"use client";
import {rememberRecoveryReturn} from "@/lib/recovery-return";
import { recoveryCheckCodes, recoveryNextStep } from "@/lib/recovery-context";
import { fetchFresh } from "@/lib/fetch-fresh";
import Link from "@/components/auth/PermissionLink";
import { useCallback, useEffect, useRef, useState } from "react";
import InspectionRecovery from "@/components/InspectionRecovery";

type Check = { code: string; title: string; detail: string; status: string };
type Run = { id: string; items: Check[]; summary: string };
const steps = ["診断", "推奨処置", "実行", "再チェック"];

async function read(response: Response) {
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(`${value.code ?? "RECOVERY_REQUEST_FAILED"}：${value.message ?? "処理結果を取得できませんでした。保存済みかは再チェックで確認してください。"}`), { code: value.code });
  return value;
}

export default function RecoveryWizard({contextRoute:sourceRoute,errorCode,initialReportId,onReturnToWork}:{contextRoute?:string;errorCode?:string;initialReportId?:string;onReturnToWork?:()=>void}) {
  const [reports,setReports]=useState<Array<{id:string;code:string;message:string;recoveryAttempts:number;sessionId?:string|null;route?:string|null}>>([]);
  const reportsInitialized=useRef(false);
  const [selectedReportId,setSelectedReportId]=useState("");
  const selectedReport=reports.find(report=>report.id===selectedReportId);
  const contextRoute=selectedReport?(selectedReport.route??"/admin/recovery"):sourceRoute;
  const leave=()=>{if(selectedReport&&contextRoute)rememberRecoveryReturn({route:contextRoute,reportId:selectedReport.id});onReturnToWork?.();};
  const relevant=recoveryCheckCodes(contextRoute,selectedReport?.code??errorCode);
  const nextStep=recoveryNextStep(contextRoute,selectedReport?.code??errorCode);
  const [verified,setVerified]=useState(false),[completionNote,setCompletionNote]=useState("");
  const readReports=useCallback(async()=>{const value=await read(await fetchFresh("/api/admin/system-check/reports?"+new URLSearchParams(initialReportId?{reportId:initialReportId}:sourceRoute?{route:sourceRoute}:{})));setReports(value.reports??[]);const firstLoad=!reportsInitialized.current;reportsInitialized.current=true;setSelectedReportId(current=>value.reports?.some((report:{id:string})=>report.id===current)?current:initialReportId?"":firstLoad?value.reports?.find((report:{code:string})=>report.code===errorCode)?.id??value.reports?.[0]?.id??"":"");},[sourceRoute,errorCode,initialReportId]);
  const finish=async(report:{id:string;recoveryAttempts:number})=>{if(!run)return;setBusy(true);setError("");try{const value=await read(await fetchFresh("/api/admin/system-check/reports",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:report.id,expectedAttempts:report.recoveryAttempts,route:contextRoute,runId:run.id,verified,reason:completionNote})}));setResult(value.message);rememberRecoveryReturn(null);await readReports();setRun(null);setRechecked(false);}catch(error){setError(error instanceof Error?error.message:"復旧完了を記録できませんでした。");}finally{setBusy(false);}};
  const diagnosisVersion = useRef(0);
  const [historyLoaded,setHistoryLoaded] = useState(false);
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null), [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [rechecked, setRechecked] = useState(false);
  useEffect(()=>{reportsInitialized.current=false;setSelectedReportId(initialReportId??"");void readReports().catch(()=>setError("RECOVERY_REPORTS_FAILED：復旧対象を取得できませんでした。"));},[readReports,initialReportId]);
  useEffect(()=>{if(sourceRoute||selectedReportId)return;let active=true;const version=diagnosisVersion.current;void fetchFresh("/api/admin/system-check").then(read).then(value=>{if(active&&version===diagnosisVersion.current&&value.runs?.[0]){setRun(value.runs[0]);setStep(1);setHistoryLoaded(true);}}).catch(()=>{});return()=>{active=false;};},[sourceRoute,selectedReportId]);
  const issues = run?.items.filter((check) => check.status !== "PASS" && (!relevant || relevant.includes(check.code))) ?? [];

  async function diagnose(recheck = false) {
    diagnosisVersion.current += 1;
    setBusy(true); setError(""); setStep(recheck ? 3 : 0); setRechecked(false);
    try {
      const value = await read(await fetchFresh("/api/admin/system-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "RUN_AUTO", contextRoute, reportId:selectedReport?.id, errorCode:selectedReport?.code??errorCode }) }));
      setRun(value.run); setHistoryLoaded(false);   setStep(recheck ? 3 : 1); setRechecked(recheck); setVerified(false); await readReports();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "診断できませんでした。"); }
    finally { setBusy(false); }
  }
  return <section className="mb-6 rounded-2xl border-2 border-blue-300 bg-white p-5 text-slate-950" aria-label="復旧ウィザード">
    <h2 className="text-2xl font-black">診断から復旧まで</h2>{<div className="my-3"><label className="font-bold">復旧するエラー<select aria-label="復旧するエラー" disabled={busy} className="mt-2 w-full rounded-xl border p-3" value={selectedReportId} onChange={event=>{setSelectedReportId(event.target.value);setRun(null);setStep(0);setRechecked(false);setVerified(false);setCompletionNote("");setError("");setResult("");}}><option value="">{sourceRoute?"現在の画面を診断":"システム全体を点検"}</option>{reports.map(report=><option key={report.id} value={report.id}>{report.code}：{report.message}</option>)}</select></label>{initialReportId&&!selectedReport&&<p role="status" className="mt-2">指定の問題は対応済み、または現在の復旧対象にありません。対象を読み直してください。</p>}<p className="mt-2 text-sm">選んだエラーに関係する点検と処置だけを表示します。画面を移動して戻った場合は、最新の状態で診断し直してください。</p><button disabled={busy} className="mt-2 underline" onClick={()=>void readReports().catch(()=>setError("RECOVERY_REPORTS_FAILED：復旧対象を取得できませんでした。"))}>復旧対象を読み直す</button></div>}<p className="mt-2 text-sm">商品・棚卸を修正した後は自動で再チェックします。通知・更新は表示された手順で結果を確認してください。</p>{historyLoaded&&<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">前回の点検結果を表示しています。現在の状態は「再チェック」で確認してください。</p>}
    <ol className="my-4 flex flex-wrap gap-3">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={`rounded-full px-4 py-2 font-bold ${step === index ? "bg-blue-700 text-white" : "bg-slate-100"}`}>{index + 1}. {label}</li>)}</ol>
    {error && <p role="alert" className="my-3 font-bold text-red-700">{error} 診断・保存の完了を確認できていません。通信を確認して、下の診断ボタンから再試行してください。</p>}
    {result && <p className="my-3 font-bold text-blue-800">{result}</p>}
    {run && <p className="mb-3">{run.summary}</p>}
    {rechecked && !error && <p role="status" className="my-3 rounded-xl bg-emerald-50 p-3 font-bold">{issues.length ? `再チェック完了。残り${issues.length}項目を確認してください。` : "今回の点検項目では異常は見つかりませんでした。元の操作が成功するか、最後に確認してください。"}</p>}
    <div className="space-y-3">{issues.map((check) => <article key={check.code} className="rounded-xl border p-4">
      <h3 className="font-black">{check.title}</h3><p className="my-2 text-sm">{check.detail}</p>
      <InspectionRecovery checkCode={check.code} runId={run!.id} onNavigate={leave} onChanged={()=>diagnose(true)} onExecuting={()=>setStep(2)}/>
    </article>)}</div>

    <div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} onClick={() => void diagnose(Boolean(run))} className="rounded-xl bg-slate-900 px-5 py-3 font-black text-white disabled:opacity-50">{busy ? `${steps[step]}中…` : run ? "次へ：再チェックする" : "次へ：このエラーを診断"}</button>{rechecked && !error && <Link onClick={leave} href={nextStep.href} className="rounded-xl border px-5 py-3 font-bold">{nextStep.text}</Link>}</div>
    {contextRoute&&rechecked&&reports.length>0&&<section className="my-4 rounded-xl border p-4"><h3 className="font-black">最後に元の操作を確認する</h3><p className="my-2 text-sm">診断だけで直ったと判断せず、元の画面で問題の操作ができるか確認します。</p><label className="flex gap-2"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>元の操作が正常にできることを確認しました</label><textarea aria-label="復旧完了の対応内容" className="my-3 w-full rounded-xl border p-3" value={completionNote} onChange={e=>setCompletionNote(e.target.value)} placeholder="実施した対応と確認結果"/>{reports.filter(report=>report.id===selectedReportId).map(report=><div key={report.id} className="my-2 rounded-xl bg-slate-50 p-3"><p>{report.code}：{report.message}</p><button disabled={busy||!verified||!completionNote.trim()||issues.some(item=>item.status==="FAIL"||item.status==="NOT_RUN")} onClick={()=>void finish(report)} className="mt-2 rounded-xl bg-blue-700 p-3 font-bold text-white disabled:opacity-40">この問題の復旧を完了する</button></div>)}</section>}

  </section>;
}
