"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FeedbackToast from "@/components/common/FeedbackToast";

const choices = [
  { mode: "NORMAL", title: "通常運用", description: "許可済み機能を通常どおり利用します。自動点検は裏側で継続します。", color: "bg-emerald-600" },
  { mode: "TEST", title: "テストモード", description: "隔離トランザクションで登録・更新・読取・削除まで実行し、最後に全変更を取り消します。", color: "bg-violet-700" },
  { mode: "MAINTENANCE", title: "メンテナンス", description: "全員の通常業務を停止します。管理者は専用復旧画面だけを利用できます。", color: "bg-rose-700" },
] as const;

type TestResult = { success: boolean; message: string; checks?: Array<{ title: string; detail: string }> };

export default function OperationModePage() {
  const [mode, setMode] = useState("NORMAL");
  const [message, setMessage] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(360);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => { void fetch("/api/admin/operation-mode", { cache: "no-store" }).then((r) => r.json()).then((data) => { setMode(data.mode === "INSPECTION" ? "TEST" : data.mode ?? "NORMAL"); setMessage(data.message ?? ""); setIntervalMinutes(data.autoCheckIntervalMinutes ?? 360); }).catch(() => setError("現在の運用モードを取得できませんでした。")); }, []);

  const save = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/operation-mode", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, message, autoCheckIntervalMinutes: intervalMinutes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "更新できませんでした。");
      setNotice("運用モードと自動点検間隔を更新しました。");
    } catch (e) { setError(e instanceof Error ? e.message : "更新できませんでした。"); }
    finally { setSaving(false); }
  };

  const runTest = async () => {
    setTesting(true); setError(""); setTestResult(null);
    try {
      const response = await fetch("/api/admin/test-mode/run", { method: "POST" });
      const data = await response.json() as TestResult;
      if (!response.ok) throw new Error(data.message || "テストを実行できませんでした。");
      setTestResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : "テストを実行できませんでした。"); }
    finally { setTesting(false); }
  };

  return <main className="min-h-screen bg-slate-100 p-4 text-slate-950 sm:p-8">
    <FeedbackToast title="設定エラー" tone="error" message={error} onClose={() => setError("")} />
    <FeedbackToast title="更新完了" tone="success" message={notice} onClose={() => setNotice("")} />
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-black text-amber-700">OPERATION CONTROL</p><h1 className="mt-1 text-3xl font-black">運用モード設定</h1></div><Link href="/admin" className="rounded-xl bg-slate-800 px-5 py-3 font-black text-white">管理者メニューへ</Link></header>
      <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">{choices.map((choice) => <button key={choice.mode} type="button" onClick={() => setMode(choice.mode)} className={`rounded-2xl border-4 p-5 text-left ${mode === choice.mode ? "border-slate-950" : "border-transparent bg-slate-50"}`}><span className={`inline-block rounded-full px-3 py-1 text-xs font-black text-white ${choice.color}`}>{choice.title}</span><p className="mt-3 text-sm font-semibold text-slate-700">{choice.description}</p></button>)}</div>
        <label className="mt-6 block font-black">自動点検の間隔<select value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-slate-300 p-3"><option value={60}>1時間ごと</option><option value={360}>6時間ごと（推奨）</option><option value={1440}>1日ごと</option></select></label>
        <p className="mt-2 text-sm font-semibold text-slate-600">点検は運用モードとは別に自動実行され、異常時はエラーレポートと管理者通知を作成します。</p>
        <label className="mt-6 block font-black">利用者への案内文<textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={300} placeholder="例：在庫データ保守のため、15時まで一般操作を停止しています。" className="mt-2 w-full rounded-xl border border-slate-300 p-4 font-medium" /></label>
        <button type="button" disabled={saving} onClick={() => void save()} className="mt-5 rounded-xl bg-blue-700 px-6 py-3 font-black text-white disabled:bg-slate-400">{saving ? "更新中…" : "この設定を反映"}</button>
      </section>
      {mode === "TEST" && <section className="mt-6 rounded-3xl bg-violet-950 p-6 text-white shadow-sm"><h2 className="text-2xl font-black">隔離テスト</h2><p className="mt-2 text-violet-100">実際のDB処理を登録から削除まで通し、完了後にトランザクションを全取消します。本番の商品・在庫数は変わりません。</p><button type="button" disabled={testing} onClick={() => void runTest()} className="mt-5 rounded-xl bg-white px-6 py-3 font-black text-violet-950 disabled:opacity-50">{testing ? "テスト実行中…" : "一連の動作テストを実行"}</button>{testResult && <div className="mt-5 rounded-2xl bg-white/10 p-4"><p className="font-black">{testResult.message}</p><div className="mt-3 space-y-2">{testResult.checks?.map((check) => <p key={check.title} className="rounded-xl bg-white/10 p-3 text-sm"><span className="mr-2 font-black text-emerald-300">正常</span>{check.title}：{check.detail}</p>)}</div></div>}</section>}
    </div>
  </main>;
}
