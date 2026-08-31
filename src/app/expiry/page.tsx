"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import FeedbackToast from "@/components/common/FeedbackToast";
import { recoverAfterFailure } from "@/lib/client-error-recovery";

type Entry = {
  id: string; expirationDate: string; expirationAlertDays: number; expirationManagementStatus: string;
  effectiveDate: string | null;
  expirationNote: string | null; expirationReviewedAt: string | null; quantity: number; unit: string | null; lotNo: string | null;
  item: { id: string; name: string; janCode: string | null; systemBarcode: string | null; majorCategory: string | null };
  storageLocation: { id: string; name: string } | null;
  assessment: { level: string; daysRemaining: number | null; label: string; action: string };
};
type Payload = { today: string; summary: Record<string, number>; entries: Entry[] };
type ErrorState = { code: string; message: string; reportId: string | null; status: "RECOVERING" | "ADMIN_REQUIRED" };

const levelStyle: Record<string, string> = {
  EXPIRED: "border-red-400 bg-red-50 text-red-950", TODAY: "border-rose-400 bg-rose-50 text-rose-950",
  CRITICAL: "border-orange-400 bg-orange-50 text-orange-950", WARNING: "border-amber-300 bg-amber-50 text-amber-950",
  UPCOMING: "border-blue-200 bg-blue-50 text-blue-950", SAFE: "border-emerald-200 bg-emerald-50 text-emerald-950",
  INVALID: "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-950",
};

function ExpiryCalendar({ month, entries, onEdit }: { month: string; entries: Entry[]; onEdit: (entry: Entry) => void }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells: Array<number | null> = [...Array(firstWeekday).fill(null), ...Array.from({ length: lastDay }, (_, index) => index + 1)];
  const byDate = new Map<string, Entry[]>();
  entries.forEach((entry) => { if (entry.effectiveDate?.startsWith(`${month}-`)) byDate.set(entry.effectiveDate, [...(byDate.get(entry.effectiveDate) ?? []), entry]); });
  return <section className="mt-5 overflow-x-auto rounded-2xl bg-white p-3 shadow-sm"><div className="grid min-w-[760px] grid-cols-7 gap-1">{["日","月","火","水","木","金","土"].map(day=><div key={day} className="p-2 text-center text-sm font-black text-slate-500">{day}</div>)}{cells.map((day,index)=>{const date=day?`${month}-${String(day).padStart(2,"0")}`:"";const rows=date?(byDate.get(date)??[]):[];return <div key={`${date}-${index}`} className="min-h-28 rounded-xl border border-slate-200 bg-slate-50 p-2">{day&&<><p className="font-black">{day}</p><div className="mt-1 space-y-1">{rows.map(entry=><button key={entry.id} onClick={()=>onEdit(entry)} className={`block w-full truncate rounded-lg border px-2 py-1 text-left text-xs font-bold ${levelStyle[entry.assessment.level]??"bg-white"}`} title={entry.item.name}>{entry.item.name}</button>)}</div></>}</div>})}</div></section>;
}

async function readPayload(response: Response) {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const value = data && typeof data === "object" ? data as { code?: string; message?: string } : {};
    const error = new Error(value.message ?? "期限情報を取得できませんでした。") as Error & { code?: string };
    error.code = value.code ?? "EXPIRY_LIST_FAILED";
    throw error;
  }
  return data as Payload;
}

export default function ExpiryPage() {
  const [data, setData] = useState<Payload>({ today: "", summary: {}, entries: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("ACTION");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [note, setNote] = useState("");
  const [alertDays, setAlertDays] = useState("30");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"CALENDAR" | "LIST">("CALENDAR");
  const [calendarMonth, setCalendarMonth] = useState("");

  const request = useCallback(async () => readPayload(await fetch("/api/expiry", { cache: "no-store" })), []);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await request()); setError(null); }
    catch (caught) {
      const code = caught instanceof Error && "code" in caught && typeof caught.code === "string" ? caught.code : "EXPIRY_LIST_FAILED";
      const message = caught instanceof Error ? caught.message : "期限情報を取得できませんでした。";
      setError({ code, message, reportId: null, status: "RECOVERING" });
      const recovery = await recoverAfterFailure({ code, title: "期限情報取得エラー", message, route: "/expiry", detail: { operation: "LIST" }, action: request });
      if (recovery.success && recovery.value) { setData(recovery.value); setError(null); setNotice("自動復旧して期限情報を取得しました。"); }
      else setError({ code, message, reportId: recovery.reportId, status: "ADMIN_REQUIRED" });
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!calendarMonth && data.today) setCalendarMonth(data.today.slice(0, 7)); }, [calendarMonth, data.today]);

  const entries = useMemo(() => data.entries.filter((entry) => {
    const q = search.trim().toLocaleLowerCase("ja");
    const text = [entry.item.name, entry.item.janCode, entry.item.systemBarcode, entry.lotNo, entry.storageLocation?.name].filter(Boolean).join(" ").toLocaleLowerCase("ja");
    const matchesSearch = !q || text.includes(q);
    const matchesFilter = filter === "ALL" || (filter === "ACTION" && ["EXPIRED", "TODAY", "CRITICAL", "WARNING", "INVALID"].includes(entry.assessment.level) && entry.expirationManagementStatus !== "RESOLVED") || filter === entry.assessment.level || filter === entry.expirationManagementStatus;
    return matchesSearch && matchesFilter;
  }), [data.entries, filter, search]);

  const openEdit = (entry: Entry) => { setEditing(entry); setNote(entry.expirationNote ?? ""); setAlertDays(String(entry.expirationAlertDays)); };
  const save = async (managementStatus: string) => {
    if (!editing) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/expiry", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, managementStatus, note, alertDays: Number(alertDays) }) });
      const payload = await response.json().catch(() => null) as { code?: string; message?: string } | null;
      if (!response.ok) throw Object.assign(new Error(payload?.message ?? "期限対応を保存できませんでした。"), { code: payload?.code ?? "EXPIRY_UPDATE_FAILED" });
      setNotice(payload?.message ?? "期限対応を保存しました。"); setEditing(null); await load();
    } catch (caught) {
      setError({ code: caught instanceof Error && "code" in caught && typeof caught.code === "string" ? caught.code : "EXPIRY_UPDATE_FAILED", message: caught instanceof Error ? caught.message : "期限対応を保存できませんでした。", reportId: null, status: "ADMIN_REQUIRED" });
    } finally { setSaving(false); }
  };

  return <main className="min-h-screen bg-slate-100 p-4 text-slate-950 sm:p-8">
    <FeedbackToast tone="error" title="期限管理エラー" message={error?.message ?? ""} errorCode={error?.code} reportId={error?.reportId} recoveryStatus={error?.status} onRetry={() => void load()} retrying={error?.status === "RECOVERING"} onClose={() => setError(null)} />
    <FeedbackToast tone="success" title="更新完了" message={notice} autoCloseMs={5000} onClose={() => setNotice("")} />
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-black tracking-widest text-orange-700">EXPIRY CONTROL</p><h1 className="mt-1 text-3xl font-black">期限管理</h1><p className="mt-2 text-slate-600">期限切れを知らせるだけでなく、優先順位・具体的な対応・確認記録まで管理します。</p></div><div className="flex gap-2"><button onClick={() => void load()} className="rounded-xl bg-orange-600 px-4 py-3 font-black text-white">再点検</button><Link href="/" className="rounded-xl bg-slate-800 px-4 py-3 font-black text-white">ホーム</Link></div></header>
      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">{[["期限切れ",data.summary.expired,"bg-red-100"],["本日",data.summary.today,"bg-rose-100"],["7日以内",data.summary.critical,"bg-orange-100"],["通知期間内",data.summary.warning,"bg-amber-100"],["日付異常",data.summary.invalid,"bg-fuchsia-100"],["確認済み",data.summary.acknowledged,"bg-blue-100"]].map(([label,value,color])=><button key={String(label)} onClick={()=>setFilter(label==="期限切れ"?"EXPIRED":label==="本日"?"TODAY":label==="7日以内"?"CRITICAL":label==="日付異常"?"INVALID":label==="確認済み"?"ACKNOWLEDGED":"WARNING")} className={`rounded-2xl p-4 text-left ${color}`}><p className="text-sm font-bold">{label}</p><p className="mt-1 text-3xl font-black">{String(value ?? 0)}</p></button>)}<div className="rounded-2xl bg-slate-200 p-4"><p className="text-sm font-bold text-red-800">期限データなし</p><p className="mt-1 text-3xl font-black text-red-800">{String(data.summary.missingExpiry ?? 0)}</p><p className="mt-1 text-xs font-semibold text-red-700">要確認・入力</p></div></section>
      <section className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border-2 border-red-200 bg-white p-3"><span className="font-bold">大分類未設定</span><strong className="ml-3 text-xl text-red-700">{data.summary.missingMajor ?? 0}</strong></div><div className="rounded-xl border-2 border-red-200 bg-white p-3"><span className="font-bold">小分類未設定</span><strong className="ml-3 text-xl text-red-700">{data.summary.missingMinor ?? 0}</strong></div><div className="rounded-xl border-2 border-red-200 bg-white p-3"><span className="font-bold">保管場所未設定</span><strong className="ml-3 text-xl text-red-700">{data.summary.missingLocation ?? 0}</strong></div></section>\n      <section className="mt-5 grid gap-3 rounded-2xl bg-white p-4 shadow-sm lg:grid-cols-[1fr_220px_auto]"><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="商品名・JAN・Lot・保管場所で検索" className="rounded-xl border border-slate-300 px-4 py-3"/><select value={filter} onChange={(e)=>setFilter(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-3 font-bold"><option value="ACTION">対応が必要</option><option value="ALL">すべて</option><option value="RESOLVED">対応完了</option><option value="SAFE">90日より先</option></select><div className="flex gap-2"><button onClick={()=>setView("CALENDAR")} className={`rounded-xl px-4 py-3 font-black ${view==="CALENDAR"?"bg-orange-600 text-white":"bg-slate-200"}`}>カレンダー</button><button onClick={()=>setView("LIST")} className={`rounded-xl px-4 py-3 font-black ${view==="LIST"?"bg-orange-600 text-white":"bg-slate-200"}`}>一覧</button></div></section>
      {view==="CALENDAR"&&<div className="mt-4 flex items-center justify-center gap-3"><button onClick={()=>{const [y,m]=calendarMonth.split("-").map(Number);const d=new Date(Date.UTC(y,m-2,1));setCalendarMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`)}} className="rounded-xl bg-white px-4 py-2 font-black">前月</button><input type="month" value={calendarMonth} onChange={(e)=>setCalendarMonth(e.target.value)} className="rounded-xl border bg-white px-4 py-2 font-black"/><button onClick={()=>{const [y,m]=calendarMonth.split("-").map(Number);const d=new Date(Date.UTC(y,m,1));setCalendarMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`)}} className="rounded-xl bg-white px-4 py-2 font-black">翌月</button></div>}
      {loading ? <p className="mt-8 text-center font-bold text-slate-600">期限を点検しています…</p> : view==="CALENDAR" ? <ExpiryCalendar month={calendarMonth} entries={entries} onEdit={openEdit}/> : <section className="mt-5 space-y-3">{entries.length===0?<div className="rounded-2xl bg-white p-8 text-center font-bold text-slate-500">条件に該当する期限情報はありません。期限データまたは分類が不足している商品は、上部のデータ不備件数を確認してください。</div>:entries.map(entry=><article key={entry.id} className={`rounded-2xl border-2 p-5 ${levelStyle[entry.assessment.level] ?? "border-slate-200 bg-white"}`}><div className="flex flex-wrap justify-between gap-4"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-1 text-sm font-black">{entry.assessment.label}</span>{entry.expirationManagementStatus!=="ACTIVE"&&<span className="rounded-full bg-blue-700 px-3 py-1 text-sm font-black text-white">{entry.expirationManagementStatus==="ACKNOWLEDGED"?"確認済み":"対応完了"}</span>}</div><h2 className="mt-2 text-xl font-black">{entry.item.name}</h2><p className="mt-1 text-sm font-bold">期限：{entry.expirationDate} ／ Lot：{entry.lotNo ?? "-"} ／ {entry.storageLocation?.name ?? "保管場所未設定"} ／ 在庫 {entry.quantity}{entry.unit ?? "個"}</p><p className="mt-3 rounded-xl bg-white/80 p-3"><span className="font-black">推奨対応：</span>{entry.assessment.action}</p>{entry.expirationNote&&<p className="mt-2 text-sm"><span className="font-black">対応メモ：</span>{entry.expirationNote}</p>}</div><div><Link href={`/items/${entry.item.id}`} className="mr-2 inline-flex rounded-xl bg-white px-4 py-3 font-black shadow-sm">商品詳細</Link><button onClick={()=>openEdit(entry)} className="rounded-xl bg-slate-900 px-4 py-3 font-black text-white">対応を記録</button></div></div></article>)}</section>}
    </div>
    {editing&&<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><h2 className="text-2xl font-black">期限対応を記録</h2><p className="mt-2 font-bold">{editing.item.name}／期限 {editing.expirationDate}</p><label className="mt-5 block font-bold">通知開始日数<input type="number" min="1" max="365" value={alertDays} onChange={(e)=>setAlertDays(e.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label><label className="mt-4 block font-bold">確認内容・判断理由<textarea rows={4} value={note} onChange={(e)=>setNote(e.target.value)} placeholder="現物状態、優先使用、値下げ、返品、廃棄予定など" className="mt-2 w-full rounded-xl border p-3"/></label><div className="mt-5 grid gap-2 sm:grid-cols-3"><button disabled={saving} onClick={()=>void save("ACKNOWLEDGED")} className="rounded-xl bg-blue-600 px-3 py-3 font-black text-white">確認済み</button><button disabled={saving} onClick={()=>void save("RESOLVED")} className="rounded-xl bg-emerald-600 px-3 py-3 font-black text-white">対応完了</button><button disabled={saving} onClick={()=>setEditing(null)} className="rounded-xl bg-slate-200 px-3 py-3 font-black">戻る</button></div><p className="mt-3 text-xs font-bold text-slate-500">更新者・時刻・変更前後の内容は在庫イベント履歴へ記録されます。</p></section></div>}
  </main>;
}


