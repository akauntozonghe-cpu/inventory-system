"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Scope = "ALL" | "LOCATION" | "MAJOR_CATEGORY" | "MINOR_CATEGORY";
type Options = { locations: Array<{ id: string; name: string }>; majorCategories: string[]; minorCategories: string[] };
type Session = { id: string; title: string; operator: string | null; scopeLabel: string | null; status: "IN_PROGRESS" | "PAUSED"; targetCount: number; recordedCount: number };

const labels: Record<Scope, string> = { ALL: "全棚卸", LOCATION: "保管場所ごと", MAJOR_CATEGORY: "大分類ごと", MINOR_CATEGORY: "小分類ごと" };

export default function StocktakeStartPage() {
  const router = useRouter();
  const [options, setOptions] = useState<Options>({ locations: [], majorCategories: [], minorCategories: [] });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [form, setForm] = useState({ title: "", operator: "", memo: "", scopeType: "ALL" as Scope, scopeValue: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/stocktake/options"), fetch("/api/stocktake/session?active=true")])
      .then(async ([optionResponse, sessionResponse]) => {
        if (optionResponse.ok) setOptions(await optionResponse.json());
        if (sessionResponse.ok) setSessions(await sessionResponse.json());
      }).catch(console.error);
  }, []);

  const values = form.scopeType === "LOCATION" ? options.locations.map((item) => ({ value: item.id, label: item.name })) :
    form.scopeType === "MAJOR_CATEGORY" ? options.majorCategories.map((value) => ({ value, label: value })) :
    form.scopeType === "MINOR_CATEGORY" ? options.minorCategories.map((value) => ({ value, label: value })) : [];

  const start = async () => {
    if (!form.title.trim()) return alert("棚卸名を入力してください");
    if (form.scopeType !== "ALL" && !form.scopeValue) return alert("棚卸対象を選択してください");
    const label = form.scopeType === "ALL" ? "全在庫" : values.find((item) => item.value === form.scopeValue)?.label ?? "";
    setSaving(true);
    try {
      const response = await fetch("/api/stocktake/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, scopeLabel: label }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      router.push("/stocktake/" + data.id);
    } catch (error) { alert(error instanceof Error ? error.message : "開始できませんでした"); }
    finally { setSaving(false); }
  };

  return <main className="mx-auto max-w-4xl p-4 text-white sm:p-8">
    <h1 className="mb-6 text-3xl font-bold">棚卸</h1>
    {sessions.length > 0 && <section className="mb-6 rounded-2xl bg-white p-5 text-slate-800 shadow">
      <h2 className="text-xl font-bold">再開できる棚卸</h2>
      <div className="mt-4 space-y-3">{sessions.map((session) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <div><strong>{session.title}</strong><p className="text-sm text-slate-600">{session.scopeLabel ?? "全在庫"}　{session.recordedCount} / {session.targetCount} 件</p></div>
        <button onClick={() => router.push("/stocktake/" + session.id)} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">{session.status === "PAUSED" ? "再開" : "開く"}</button>
      </div>)}</div>
    </section>}
    <section className="rounded-2xl bg-white p-5 text-slate-800 shadow sm:p-8">
      <h2 className="text-xl font-bold">新しい棚卸を開始</h2>
      <div className="mt-5 space-y-5">
        <label className="block font-bold">棚卸名<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-2 w-full rounded-lg border p-3" placeholder="例：8月 倉庫棚卸" /></label>
        <label className="block font-bold">担当者<input value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} className="mt-2 w-full rounded-lg border p-3" placeholder="管理者" /></label>
        <div><p className="font-bold">棚卸範囲</p><div className="mt-2 grid grid-cols-2 gap-2">{(Object.keys(labels) as Scope[]).map((scope) => <button key={scope} onClick={() => setForm({ ...form, scopeType: scope, scopeValue: "" })} className={"rounded-lg border p-3 text-left font-bold " + (form.scopeType === scope ? "border-blue-600 bg-blue-50 text-blue-700" : "")}>{labels[scope]}</button>)}</div></div>
        {form.scopeType !== "ALL" && <label className="block font-bold">{labels[form.scopeType]}を選択<select value={form.scopeValue} onChange={(e) => setForm({ ...form, scopeValue: e.target.value })} className="mt-2 w-full rounded-lg border p-3"><option value="">選択してください</option>{values.map((value) => <option key={value.value} value={value.value}>{value.label}</option>)}</select></label>}
        <label className="block font-bold">メモ<textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} className="mt-2 w-full rounded-lg border p-3" rows={3} /></label>
        <button onClick={start} disabled={saving} className="w-full rounded-xl bg-blue-600 py-4 text-lg font-bold text-white">{saving ? "開始中..." : "棚卸を開始する"}</button>
      </div>
    </section>
  </main>;
}
