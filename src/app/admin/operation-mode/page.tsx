"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FeedbackToast from "@/components/common/FeedbackToast";

const choices = [
  { mode: "NORMAL", title: "通常運用", description: "すべての許可済み機能を通常どおり利用します。", color: "bg-emerald-600" },
  { mode: "INSPECTION", title: "点検モード", description: "機能は利用可能なまま、全画面に点検中の案内を出します。", color: "bg-amber-600" },
  { mode: "MAINTENANCE", title: "メンテナンス", description: "管理者以外の更新操作を停止し、管理者だけが復旧作業を行います。", color: "bg-rose-700" },
] as const;

export default function OperationModePage() {
  const [mode, setMode] = useState("NORMAL");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { void fetch("/api/admin/operation-mode", { cache: "no-store" }).then((r) => r.json()).then((data) => { setMode(data.mode ?? "NORMAL"); setMessage(data.message ?? ""); }).catch(() => setError("現在の運用モードを取得できませんでした。")); }, []);
  const save = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/operation-mode", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, message }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "更新できませんでした。");
      setNotice("運用モードを更新しました。全端末へ順次反映されます。");
    } catch (e) { setError(e instanceof Error ? e.message : "更新できませんでした。"); }
    finally { setSaving(false); }
  };
  return <main className="min-h-screen bg-slate-100 p-4 text-slate-950 sm:p-8">
    <FeedbackToast title="設定エラー" tone="error" message={error} onClose={() => setError("")} />
    <FeedbackToast title="更新完了" tone="success" message={notice} onClose={() => setNotice("")} />
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-black text-amber-700">OPERATION CONTROL</p><h1 className="mt-1 text-3xl font-black">運用モード設定</h1></div><Link href="/admin" className="rounded-xl bg-slate-800 px-5 py-3 font-black text-white">管理者メニューへ</Link></header>
      <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm"><div className="grid gap-4 sm:grid-cols-3">{choices.map((choice) => <button key={choice.mode} type="button" onClick={() => setMode(choice.mode)} className={`rounded-2xl border-4 p-5 text-left ${mode === choice.mode ? "border-slate-950" : "border-transparent bg-slate-50"}`}><span className={`inline-block rounded-full px-3 py-1 text-xs font-black text-white ${choice.color}`}>{choice.title}</span><p className="mt-3 text-sm font-semibold text-slate-700">{choice.description}</p></button>)}</div>
        <label className="mt-6 block font-black">利用者への案内文<textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={300} placeholder="例：在庫データ点検のため、15時まで更新操作を停止しています。" className="mt-2 w-full rounded-xl border border-slate-300 p-4 font-medium" /></label>
        <button type="button" disabled={saving} onClick={() => void save()} className="mt-5 rounded-xl bg-blue-700 px-6 py-3 font-black text-white disabled:bg-slate-400">{saving ? "更新中…" : "この設定を反映"}</button>
      </section>
    </div>
  </main>;
}
