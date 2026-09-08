"use client";
import { fetchFresh } from "@/lib/fetch-fresh";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AdminModeDialog from "@/components/stocktake/AdminModeDialog";

type Check = { code: string; title: string; detail: string; status: string };
type Run = { id: string; items: Check[]; summary: string };
type Target = { item: { id: string; name: string } };
type Action = { action: string; itemId?: string; sessionId?: string; reason?: string; label: string };
type Session = { id:string; title:string; status:string; scopeLabel:string|null; };
const steps = ["診断", "推奨処置", "実行", "再チェック"];
const advice: Record<string, { text: string; href: string }> = {
  CHECK_INVALID_UNITS: { text: "商品詳細で「0」などの単位を正しい名称へ変更してください。", href: "/items" },
  CHECK_DUPLICATE_PRODUCTS: { text: "重複候補を確認し、同じ商品か判断してから整理してください。", href: "/admin/system-check" },
  CHECK_ACTIVE_STOCKTAKE: { text: "作業者と対象範囲を確認してください。複数端末での作業だけを理由に棚卸を取り消さないでください。", href: "/stocktake/start" },
  CHECK_REVIEW_RECORDS: { text: "対象の棚卸を開き、入力記録を確認してください。", href: "/stocktake/start" },
  CHECK_STOCKTAKE_TARGET_LINK: { text: "点検結果の該当記録を管理者が確認してください。数量を推測して補完しません。", href: "/admin/error-reports" },
};

async function read(response: Response) {
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.message ?? "処理に失敗しました。"), { code: value.code });
  return value;
}

export default function RecoveryWizard({contextRoute}:{contextRoute?:string}) {
  const [reports,setReports]=useState<Array<{id:string;code:string;message:string;recoveryAttempts:number}>>([]);
  const [verified,setVerified]=useState(false),[completionNote,setCompletionNote]=useState("");
  const readReports=async()=>{if(!contextRoute)return;const value=await read(await fetchFresh("/api/admin/system-check/reports?"+new URLSearchParams({route:contextRoute})));setReports(value.reports??[]);};
  const finish=async(report:{id:string;recoveryAttempts:number})=>{if(!run)return;setBusy(true);setError("");try{const value=await read(await fetchFresh("/api/admin/system-check/reports",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:report.id,expectedAttempts:report.recoveryAttempts,route:contextRoute,runId:run.id,verified,reason:completionNote})}));setResult(value.message);await readReports();}catch(error){setError(error instanceof Error?error.message:"復旧完了を記録できませんでした。");}finally{setBusy(false);}};
  const diagnosisVersion = useRef(0);
  const [review,setReview] = useState<Action|null>(null);
  const [reason,setReason] = useState("");
  const [sessions,setSessions] = useState<Session[]>([]);
  const [historyLoaded,setHistoryLoaded] = useState(false);
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null), [error, setError] = useState("");
  const [targets, setTargets] = useState<Target[]>([]), [result, setResult] = useState("");
  const [pending, setPending] = useState<Action | "TARGETS" | null>(null);
  const [rechecked, setRechecked] = useState(false);
  useEffect(()=>{let active=true;const version=diagnosisVersion.current;void fetchFresh("/api/admin/system-check").then(read).then(value=>{if(active&&version===diagnosisVersion.current&&value.runs?.[0]){setRun(value.runs[0]);setStep(1);setHistoryLoaded(true);}}).catch(()=>{});return()=>{active=false;};},[]);
  const issues = run?.items.filter((check) => check.status !== "PASS") ?? [];

  async function diagnose(recheck = false) {
    diagnosisVersion.current += 1;
    setBusy(true); setError(""); setStep(recheck ? 3 : 0); setRechecked(false);
    try {
      const value = await read(await fetchFresh("/api/admin/system-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "RUN_AUTO" }) }));
      setRun(value.run); setHistoryLoaded(false); setTargets([]); setSessions([]); setStep(recheck ? 3 : 1); setRechecked(recheck); setVerified(false); await readReports();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "診断できませんでした。"); }
    finally { setBusy(false); }
  }
  async function loadTargets() {
    setBusy(true); setError("");
    try {
      const value = await read(await fetchFresh("/api/admin/system-check/remediate", { cache: "no-store" }));
      setSessions(value.activeSessions ?? []);
      setTargets([...new Map((value.inventoriesWithoutIdentifier as Target[]).map((entry) => [entry.item.id, entry])).values()]);
    } catch (caught) {
      if (caught instanceof Error && "code" in caught && caught.code === "ADMIN_ELEVATION_REQUIRED") setPending("TARGETS");
      else setError(caught instanceof Error ? caught.message : "対象を確認できませんでした。");
    } finally { setBusy(false); }
  }
  async function execute(action: Action) {
    diagnosisVersion.current += 1;
    setBusy(true); setError(""); setStep(2); setResult("");
    try {
      const value = await read(await fetch("/api/admin/system-check/remediate", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) }));
      setResult(value.message ?? "処置を実行しました。");
      await diagnose(true);
    } catch (caught) {
      if (caught instanceof Error && "code" in caught && caught.code === "ADMIN_ELEVATION_REQUIRED") { setPending(action); setStep(1); }
      else { setError(caught instanceof Error ? caught.message : "処置を実行できませんでした。"); setRechecked(false); }
    } finally { setBusy(false); }
  }
  return <section className="mb-6 rounded-2xl border-2 border-blue-300 bg-white p-5 text-slate-950" aria-label="復旧ウィザード">
    <h2 className="text-2xl font-black">診断から復旧まで</h2><p className="mt-2 text-sm">1件ずつ、対象と影響を確認して処置し、再診断で結果を確かめます。</p>{historyLoaded&&<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">前回の点検結果を表示しています。現在の状態は「再チェック」で確認してください。</p>}
    <ol className="my-4 flex flex-wrap gap-3">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={`rounded-full px-4 py-2 font-bold ${step === index ? "bg-blue-700 text-white" : "bg-slate-100"}`}>{index + 1}. {label}</li>)}</ol>
    {error && <p role="alert" className="my-3 font-bold text-red-700">{error} 再チェックが成功するまで、復旧完了とは表示しません。</p>}
    {result && <p className="my-3 font-bold text-blue-800">{result}</p>}
    {run && <p className="mb-3">{run.summary}</p>}
    {rechecked && !error && <p role="status" className="my-3 rounded-xl bg-emerald-50 p-3 font-bold">{issues.length ? `再チェック完了。残り${issues.length}項目を確認してください。` : "再チェックで異常は見つかりませんでした。"}</p>}
    <div className="space-y-3">{issues.map((check) => <article key={check.code} className="rounded-xl border p-4">
      <h3 className="font-black">{check.title}</h3><p className="my-2 text-sm">{check.detail}</p>
      {check.code === "CHECK_PRODUCT_LINKS" ? <><p className="my-2 text-sm">商品マスターの分類・メーカーへ関連在庫を揃え、分類の選択肢を補います。数量やロット番号はそのままです。</p><button disabled={busy} onClick={() => {setReason("");setReview({ action: "SYNC_PRODUCT_METADATA", label: "商品情報の紐付けを修復" });}} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50">商品情報の紐付けを修復する</button></> : check.code === "CHECK_PRODUCT_IDENTIFIERS" ? <>
        <button disabled={busy} onClick={() => void loadTargets()} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50">コード未設定の商品を確認</button>
        {targets.map(({ item }) => <div key={item.id} className="mt-3 flex flex-wrap items-center gap-3"><span>{item.name}</span><button disabled={busy} onClick={() => {setReason("");setReview({ action: "ISSUE_SYSTEM_BARCODE", itemId: item.id, label: `${item.name}のコード発行` });}} className="rounded-lg border px-3 py-2 font-bold">この商品にコードを発行して再チェック</button></div>)}
      </> : <><p className="my-2 text-sm">{advice[check.code]?.text ?? "該当する設定を確認し、修正後に再チェックしてください。"}</p><Link href={advice[check.code]?.href ?? "/admin/error-reports"} target="_blank" rel="noopener" className="font-bold text-blue-700 underline">対応画面を別タブで開く</Link></>}
    </article>)}</div>
    {run&&<section className="my-4 rounded-xl border p-4"><h3 className="font-black">止まっている棚卸を復旧する</h3><p className="my-2 text-sm">確認待ち・完了済みは棚卸管理で再開します。取消は入力内容を確認してから実行します。</p><button disabled={busy} className="rounded-lg border px-3 py-2 font-bold" onClick={()=>void loadTargets()}>対象の棚卸を確認</button><Link href="/admin/stocktake" className="ml-3 font-bold text-blue-700 underline">確認待ち・完了済みを再開</Link>{sessions.map(session=><div key={session.id} className="mt-3 rounded-xl bg-slate-50 p-3"><p className="font-bold">{session.title} ／ {session.scopeLabel}</p><Link href={"/stocktake/"+session.id} className="mr-3 text-blue-700 underline">記録を確認</Link>{session.status==="PAUSED"&&<button disabled={busy} className="rounded-lg border p-2" onClick={()=>{setReason("");setReview({action:"RESUME_SESSION",sessionId:session.id,label:session.title+"を再開"});}}>再開する</button>}{session.status==="IN_PROGRESS"&&<button disabled={busy} className="rounded-lg border p-2" onClick={()=>{setReason("");setReview({action:"PAUSE_SESSION",sessionId:session.id,label:session.title+"を中断"});}}>中断する</button>}<button disabled={busy} className="ml-2 rounded-lg border p-2 text-red-700" onClick={()=>{setReason("");setReview({action:"CANCEL_SESSION",sessionId:session.id,label:session.title+"を取消"});}}>取消を確認</button></div>)}</section>}
    <div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} onClick={() => void diagnose(Boolean(run))} className="rounded-xl bg-slate-900 px-5 py-3 font-black text-white disabled:opacity-50">{busy ? `${steps[step]}中…` : run ? "再チェックする" : "診断を開始する"}</button>{rechecked && issues.length === 0 && !error && <Link href="/admin/operation-mode" className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">運用状態を確認する</Link>}</div>
    {contextRoute&&rechecked&&reports.length>0&&<section className="my-4 rounded-xl border p-4"><h3 className="font-black">最後に元の操作を確認する</h3><p className="my-2 text-sm">診断だけで直ったと判断せず、元の画面で問題の操作ができるか確認します。</p><label className="flex gap-2"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>元の操作が正常にできることを確認しました</label><textarea aria-label="復旧完了の対応内容" className="my-3 w-full rounded-xl border p-3" value={completionNote} onChange={e=>setCompletionNote(e.target.value)} placeholder="実施した対応と確認結果"/>{reports.map(report=><div key={report.id} className="my-2 rounded-xl bg-slate-50 p-3"><p>{report.code}：{report.message}</p><button disabled={busy||!verified||!completionNote.trim()||issues.some(item=>item.status==="FAIL"||item.status==="NOT_RUN")} onClick={()=>void finish(report)} className="mt-2 rounded-xl bg-blue-700 p-3 font-bold text-white disabled:opacity-40">この問題の復旧を完了する</button></div>)}</section>}
    {review&&<div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/60 p-4"><section role="dialog" aria-modal="true" aria-label="復旧処置の確認" className="w-full max-w-lg rounded-2xl bg-white p-5"><h3 className="text-xl font-black">{review.label}</h3><p className="my-3">{review.action==="CANCEL_SESSION"?"棚卸を取り消します。入力と対象の記録を確認してください。在庫の数量はこの操作では変更しません。":review.action==="SYNC_PRODUCT_METADATA"?"商品マスターに合わせて在庫の分類・メーカー情報と分類の選択肢を修復します。数量は変更しません。":"選択した対象だけに処置を実行し、その後に再診断します。"}</p><textarea aria-label="復旧の理由" value={reason} onChange={e=>setReason(e.target.value)} placeholder="処置の理由（必須）" className="w-full rounded-xl border p-3"/><div className="mt-3 flex gap-3"><button disabled={busy||!reason.trim()} className="rounded-xl bg-blue-700 p-3 font-bold text-white disabled:opacity-40" onClick={()=>{const action={...review,reason};setReview(null);void execute(action);}}>この内容で実行</button><button className="rounded-xl border p-3" onClick={()=>setReview(null)}>戻る</button></div></section></div>}
    <AdminModeDialog open={Boolean(pending)} sessionId="" purpose="表示された復旧処置を実行するため、管理者として再認証してください。" onClose={() => setPending(null)} onAuthenticated={() => { const action = pending; setPending(null); if (action === "TARGETS") void loadTargets(); else if (action) void execute(action); }}/>
  </section>;
}
