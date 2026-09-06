"use client";
import Link from "next/link";
import { useState } from "react";
import AdminModeDialog from "@/components/stocktake/AdminModeDialog";

type Check = { code: string; title: string; detail: string; status: string };
type Run = { id: string; items: Check[]; summary: string };
type Target = { item: { id: string; name: string } };
type Action = { action: string; itemId?: string; label: string };
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

export default function RecoveryWizard() {
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null), [error, setError] = useState("");
  const [targets, setTargets] = useState<Target[]>([]), [result, setResult] = useState("");
  const [pending, setPending] = useState<Action | "TARGETS" | null>(null);
  const [rechecked, setRechecked] = useState(false);
  const issues = run?.items.filter((check) => check.status !== "PASS") ?? [];

  async function diagnose(recheck = false) {
    setBusy(true); setError(""); setStep(recheck ? 3 : 0); setRechecked(false);
    try {
      const value = await read(await fetch("/api/admin/system-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "RUN_AUTO" }) }));
      setRun(value.run); setTargets([]); setStep(recheck ? 3 : 1); setRechecked(recheck);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "診断できませんでした。"); }
    finally { setBusy(false); }
  }
  async function loadTargets() {
    setBusy(true); setError("");
    try {
      const value = await read(await fetch("/api/admin/system-check/remediate", { cache: "no-store" }));
      setTargets([...new Map((value.inventoriesWithoutIdentifier as Target[]).map((entry) => [entry.item.id, entry])).values()]);
    } catch (caught) {
      if (caught instanceof Error && "code" in caught && caught.code === "ADMIN_ELEVATION_REQUIRED") setPending("TARGETS");
      else setError(caught instanceof Error ? caught.message : "対象を確認できませんでした。");
    } finally { setBusy(false); }
  }
  async function execute(action: Action) {
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
    <h2 className="text-2xl font-black">復旧ウィザード</h2>
    <ol className="my-4 flex flex-wrap gap-3">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={`rounded-full px-4 py-2 font-bold ${step === index ? "bg-blue-700 text-white" : "bg-slate-100"}`}>{index + 1}. {label}</li>)}</ol>
    {error && <p role="alert" className="my-3 font-bold text-red-700">{error} 再チェックが成功するまで、復旧完了とは表示しません。</p>}
    {result && <p className="my-3 font-bold text-blue-800">{result}</p>}
    {run && <p className="mb-3">{run.summary}</p>}
    {rechecked && !error && <p role="status" className="my-3 rounded-xl bg-emerald-50 p-3 font-bold">{issues.length ? `再チェック完了。残り${issues.length}項目を確認してください。` : "再チェックで異常は見つかりませんでした。"}</p>}
    <div className="space-y-3">{issues.map((check) => <article key={check.code} className="rounded-xl border p-4">
      <h3 className="font-black">{check.title}</h3><p className="my-2 text-sm">{check.detail}</p>
      {check.code === "CHECK_PRODUCT_LINKS" ? <><p className="my-2 text-sm">商品マスターの分類・メーカーへ関連在庫を揃え、分類の選択肢を補います。数量やロット番号はそのままです。</p><button disabled={busy} onClick={() => void execute({ action: "SYNC_PRODUCT_METADATA", label: "商品情報の紐付けを修復" })} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50">商品情報の紐付けを修復する</button></> : check.code === "CHECK_PRODUCT_IDENTIFIERS" ? <>
        <button disabled={busy} onClick={() => void loadTargets()} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50">コード未設定の商品を確認</button>
        {targets.map(({ item }) => <div key={item.id} className="mt-3 flex flex-wrap items-center gap-3"><span>{item.name}</span><button disabled={busy} onClick={() => void execute({ action: "ISSUE_SYSTEM_BARCODE", itemId: item.id, label: `${item.name}のコード発行` })} className="rounded-lg border px-3 py-2 font-bold">この商品にコードを発行して再チェック</button></div>)}
      </> : <><p className="my-2 text-sm">{advice[check.code]?.text ?? "該当する設定を確認し、修正後に再チェックしてください。"}</p><Link href={advice[check.code]?.href ?? "/admin/error-reports"} target="_blank" rel="noopener" className="font-bold text-blue-700 underline">対応画面を別タブで開く</Link></>}
    </article>)}</div>
    <div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} onClick={() => void diagnose(Boolean(run))} className="rounded-xl bg-slate-900 px-5 py-3 font-black text-white disabled:opacity-50">{busy ? `${steps[step]}中…` : run ? "再チェックする" : "診断を開始する"}</button>{rechecked && issues.length === 0 && !error && <Link href="/admin/operation-mode" className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">運用状態を確認する</Link>}</div>
    <AdminModeDialog open={Boolean(pending)} sessionId="" purpose="表示された復旧処置を実行するため、管理者として再認証してください。" onClose={() => setPending(null)} onAuthenticated={() => { const action = pending; setPending(null); if (action === "TARGETS") void loadTargets(); else if (action) void execute(action); }}/>
  </section>;
}
