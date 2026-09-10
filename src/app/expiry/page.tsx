"use client";
import ProductIdentity from "@/components/inventory/ProductIdentity";
import { fetchFresh } from "@/lib/fetch-fresh";

import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { displayUnit } from "@/lib/unit";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import FeedbackToast from "@/components/common/FeedbackToast";
import { recoverAfterFailure } from "@/lib/client-error-recovery";
import { expiryPolicy, expiryPolicyLabels, matchesExpiryFilter } from "@/lib/expiry-policy";
import { formatExpirationDate } from "@/lib/expiry-management";

type Entry = {
  id: string; expirationDate: string | null; expirationAlertDays: number; expirationManagementStatus: string;
  effectiveDate: string | null;
  expirationNote: string | null; expirationReviewedAt: string | null; quantity: number; unit: string | null; lotNo: string | null;
  item: { id: string; name: string; janCode: string | null; systemBarcode: string | null; majorCategory: string | null; minorCategory: string | null };
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
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return <section className="mt-5 rounded-2xl bg-white p-8 text-center font-bold text-slate-500 shadow-sm">カレンダーを準備しています…</section>;
  }
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
  const [dataIssue, setDataIssue] = useState<"NONE" | "MAJOR" | "MINOR" | "LOCATION">("NONE");

  const request = useCallback(async () => readPayload(await fetchFresh("/api/expiry")), []);
  useLiveRefresh(async () => { setData(await request()); });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await request();
      setData(payload);
      setCalendarMonth((current) => current || payload.today.slice(0, 7));
      setError(null);
    }
    catch (caught) {
      const code = caught instanceof Error && "code" in caught && typeof caught.code === "string" ? caught.code : "EXPIRY_LIST_FAILED";
      const message = caught instanceof Error ? caught.message : "期限情報を取得できませんでした。";
      setError({ code, message, reportId: null, status: "RECOVERING" });
      const recovery = await recoverAfterFailure({ code, title: "期限情報取得エラー", message, route: "/expiry", detail: { operation: "LIST" }, action: request });
      if (recovery.success && recovery.value) {
        setData(recovery.value);
        setCalendarMonth((current) => current || recovery.value!.today.slice(0, 7));
        setError(null);
        setNotice("自動復旧して期限情報を取得しました。");
      }
      else setError({ code, message, reportId: recovery.reportId, status: "ADMIN_REQUIRED" });
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (new URLSearchParams(window.location.search).has("itemId")) { setFilter("ALL"); setView("LIST"); } }, []);
  useEffect(() => { if (!calendarMonth && data.today) setCalendarMonth(data.today.slice(0, 7)); }, [calendarMonth, data.today]);

  const entries = useMemo(() => data.entries.filter((entry) => {
    const q = search.trim().toLocaleLowerCase("ja");
    const text = [entry.item.name, entry.item.janCode, entry.item.systemBarcode, entry.lotNo, entry.storageLocation?.name].filter(Boolean).join(" ").toLocaleLowerCase("ja");
    const matchesSearch = !q || text.includes(q);
    const matchesFilter = matchesExpiryFilter(entry, filter);
    const matchesIssue = dataIssue === "NONE" || (dataIssue === "MAJOR" && !entry.item.majorCategory) || (dataIssue === "MINOR" && !entry.item.minorCategory) || (dataIssue === "LOCATION" && !entry.storageLocation);
    const itemId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("itemId") : null;
    return (!itemId || entry.item.id === itemId) && matchesSearch && matchesFilter && matchesIssue;
  }), [data.entries, dataIssue, filter, search]);

  const calendarEntries = useMemo(() => entries.filter((entry) => entry.effectiveDate?.startsWith(`${calendarMonth}-`)), [calendarMonth, entries]);

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
      <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-black tracking-widest text-orange-700">EXPIRY CONTROL</p><h1 className="mt-1 text-3xl font-black">期限管理</h1><p className="mt-2 text-slate-600">期限切れを知らせるだけでなく、優先順位・具体的な対応・確認記録まで管理します。</p></div><div className="flex gap-2"><button onClick={() => void load()} className="rounded-xl bg-orange-600 px-4 py-3 font-black text-white">再点検</button></div></header>
      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">{[["期限切れ",data.summary.expired,"bg-red-100"],["本日",data.summary.today,"bg-rose-100"],["7日以内",data.summary.critical,"bg-orange-100"],["通知期間内",data.summary.warning,"bg-amber-100"],["日付異常",data.summary.invalid,"bg-fuchsia-100"],["確認済み",data.summary.acknowledged,"bg-blue-100"]].map(([label,value,color])=><button key={String(label)} onClick={()=>{setDataIssue("NONE");setFilter(label==="期限切れ"?"EXPIRED":label==="本日"?"TODAY":label==="7日以内"?"CRITICAL":label==="日付異常"?"INVALID":label==="確認済み"?"ACKNOWLEDGED":"WARNING")}} className={`rounded-2xl p-4 text-left ${color}`}><p className="text-sm font-bold">{label}</p><p className="mt-1 text-3xl font-black">{String(value ?? 0)}</p></button>)}<button onClick={()=>{setDataIssue("NONE");setFilter("NO_EXPIRY");setView("LIST")}} className="rounded-2xl bg-slate-200 p-4 text-left"><p className="text-sm font-bold">対応不要</p><p className="mt-1 text-3xl font-black">{String(data.summary.noExpiry ?? 0)}</p><p className="mt-1 text-xs font-semibold text-slate-600">期限管理しない設定</p></button></section>
      <button onClick={()=>{setDataIssue("NONE");setFilter("UNSET");setView("LIST")}} className="mt-3 rounded-xl bg-white p-4 font-bold">期限管理：未設定 {data.summary.missingExpiry ?? 0}件 ／ 未設定の商品を表示 →</button><p className="mt-2 text-sm">未設定＝管理するか未決定 ／ 管理対象＝期限を登録・確認 ／ 対応不要＝管理しないと設定済み。分類・保管場所の未設定は別の項目です。</p><section className="mt-3 grid gap-3 sm:grid-cols-3"><button onClick={()=>{setDataIssue("MAJOR");setFilter("ALL");setView("LIST")}} className="rounded-xl border border-slate-200 bg-white p-3 text-left"><span className="font-bold">大分類未設定</span><strong className="ml-3 text-xl text-red-700">{data.summary.missingMajor ?? 0}</strong><span className="block text-xs font-bold text-teal-700">該当商品を表示 →</span></button><button onClick={()=>{setDataIssue("MINOR");setFilter("ALL");setView("LIST")}} className="rounded-xl border border-slate-200 bg-white p-3 text-left"><span className="font-bold">小分類未設定</span><strong className="ml-3 text-xl text-red-700">{data.summary.missingMinor ?? 0}</strong><span className="block text-xs font-bold text-teal-700">該当商品を表示 →</span></button><button onClick={()=>{setDataIssue("LOCATION");setFilter("ALL");setView("LIST")}} className="rounded-xl border border-slate-200 bg-white p-3 text-left"><span className="font-bold">保管場所未設定</span><strong className="ml-3 text-xl text-red-700">{data.summary.missingLocation ?? 0}</strong><span className="block text-xs font-bold text-teal-700">該当商品を表示 →</span></button></section>
      <section className="mt-5 grid gap-3 rounded-2xl bg-white p-4 shadow-sm lg:grid-cols-[1fr_220px_auto]"><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="商品名・JAN・Lot・保管場所で検索" className="rounded-xl border border-slate-300 px-4 py-3"/><select value={filter} onChange={(e)=>{setFilter(e.target.value);setDataIssue("NONE");setView("LIST")}} className="rounded-xl border border-slate-300 px-4 py-3 font-bold"><option value="ACTION">対応が必要</option><option value="ALL">すべて</option><option value="UNSET">未設定</option><option value="MANAGED">管理対象</option><option value="NO_EXPIRY">対応不要</option><option value="RESOLVED">対応完了</option><option value="SAFE">90日より先</option></select><div className="flex gap-2"><button onClick={()=>setView("CALENDAR")} className={`rounded-xl px-4 py-3 font-black ${view==="CALENDAR"?"bg-orange-600 text-white":"bg-slate-200"}`}>カレンダー</button><button onClick={()=>setView("LIST")} className={`rounded-xl px-4 py-3 font-black ${view==="LIST"?"bg-orange-600 text-white":"bg-slate-200"}`}>一覧</button></div></section>
      {view==="CALENDAR"&&<div className="mt-4 flex items-center justify-center gap-3"><button onClick={()=>{const [y,m]=calendarMonth.split("-").map(Number);const d=new Date(Date.UTC(y,m-2,1));setCalendarMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`)}} className="rounded-xl bg-white px-4 py-2 font-black">前月</button><input type="month" value={calendarMonth} onChange={(e)=>setCalendarMonth(e.target.value)} className="rounded-xl border bg-white px-4 py-2 font-black"/><button onClick={()=>{const [y,m]=calendarMonth.split("-").map(Number);const d=new Date(Date.UTC(y,m,1));setCalendarMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`)}} className="rounded-xl bg-white px-4 py-2 font-black">翌月</button></div>}
      {loading ? <p className="mt-8 text-center font-bold text-slate-600">期限を点検しています…</p> : view==="CALENDAR" ? <><ExpiryCalendar month={calendarMonth} entries={entries} onEdit={openEdit}/><section className="mt-5 rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">{calendarMonth.replace(/^(\\d{4})-(\\d{2})$/,(_,y,m)=>`${y}年${Number(m)}月`)}の期限一覧</h2><div className="mt-3 divide-y">{calendarEntries.length===0?<p className="py-6 text-center text-slate-500">この月に期限を迎える商品はありません。</p>:calendarEntries.map(entry=><button key={entry.id} onClick={()=>openEdit(entry)} className="flex w-full justify-between gap-3 py-3 text-left"><span><strong className="block">{entry.item.name}</strong><small>{entry.storageLocation?.name??"保管場所未設定"}</small></span><strong>{formatExpirationDate(entry.expirationDate)}</strong></button>)}</div></section></> : <section className="mt-5 space-y-3">{entries.length===0?<div className="rounded-2xl bg-white p-8 text-center font-bold text-slate-500">条件に該当する期限情報はありません。期限データまたは分類が不足している商品は、上部のデータ不備件数を確認してください。</div>:entries.map(entry=><article key={entry.id} className={`rounded-2xl border-2 p-5 ${levelStyle[entry.assessment.level] ?? "border-slate-200 bg-white"}`}><div className="flex flex-wrap justify-between gap-4"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-1 text-sm font-black">{expiryPolicyLabels[expiryPolicy(entry.expirationDate, entry.expirationManagementStatus)]}{expiryPolicy(entry.expirationDate, entry.expirationManagementStatus)==="MANAGED" ? ` ／ ${entry.assessment.label}` : ""}</span>{["ACKNOWLEDGED", "RESOLVED"].includes(entry.expirationManagementStatus)&&<span className="rounded-full bg-blue-700 px-3 py-1 text-sm font-black text-white">{entry.expirationManagementStatus==="ACKNOWLEDGED"?"確認済み":"対応完了"}</span>}</div><h2 className="mt-2 text-xl font-black">{entry.item.name}</h2><p className="mt-1 text-sm">大分類：{entry.item.majorCategory || "未設定"} ／ 小分類：{entry.item.minorCategory || "未設定"}</p><ProductIdentity item={entry.item}/><p className="mt-1 text-sm font-bold">期限：{formatExpirationDate(entry.expirationDate)} ／ Lot：{entry.lotNo ?? "-"} ／ {entry.storageLocation?.name ?? "保管場所未設定"} ／ 在庫 {entry.quantity}{displayUnit(entry.unit)}</p>{expiryPolicy(entry.expirationDate, entry.expirationManagementStatus)==="MANAGED"&&<p className="mt-3 rounded-xl bg-white/80 p-3"><span className="font-black">推奨対応：</span>{entry.assessment.action}</p>}{entry.expirationNote&&<p className="mt-2 text-sm"><span className="font-black">対応メモ：</span>{entry.expirationNote}</p>}</div><div><Link href={`/items/${entry.item.id}?inventoryId=${encodeURIComponent(entry.id)}`} className="mr-2 inline-flex rounded-xl bg-white px-4 py-3 font-black shadow-sm">詳細・編集</Link>{<button onClick={()=>openEdit(entry)} className="rounded-xl bg-slate-900 px-4 py-3 font-black text-white">期限管理を設定・記録</button>}</div></div></article>)}</section>}
    </div>
    {editing&&<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><h2 className="text-2xl font-black">期限対応を記録</h2><p className="mt-2 font-bold">{editing.item.name}／期限 {formatExpirationDate(editing.expirationDate)}</p><p className="mt-3 font-bold">期限管理：{expiryPolicyLabels[expiryPolicy(editing.expirationDate, editing.expirationManagementStatus)]}</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={saving} onClick={()=>void save("MANAGED")} className="rounded-xl bg-orange-600 p-3 font-bold text-white">管理対象にする</button><button disabled={saving} onClick={()=>void save("NO_EXPIRY")} className="rounded-xl bg-slate-700 p-3 font-bold text-white">対応不要にする</button>{!editing.expirationDate&&<button disabled={saving} onClick={()=>void save("UNSET")} className="rounded-xl bg-slate-200 p-3 font-bold">未設定に戻す</button>}</div><Link href={`/items/${editing.item.id}?inventoryId=${encodeURIComponent(editing.id)}`} className="mt-3 inline-block underline">商品詳細で期限を登録・修正</Link><label className="mt-5 block font-bold">通知開始日数<input type="number" min="1" max="365" value={alertDays} onChange={(e)=>setAlertDays(e.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label><label className="mt-4 block font-bold">確認内容・判断理由<textarea rows={4} value={note} onChange={(e)=>setNote(e.target.value)} placeholder="現物状態、優先使用、値下げ、返品、廃棄予定など" className="mt-2 w-full rounded-xl border p-3"/></label><div className="mt-5 grid gap-2 sm:grid-cols-3"><button disabled={saving || expiryPolicy(editing.expirationDate, editing.expirationManagementStatus)!=="MANAGED"} onClick={()=>void save("ACKNOWLEDGED")} className="rounded-xl bg-blue-600 px-3 py-3 font-black text-white">確認済み</button><button disabled={saving || expiryPolicy(editing.expirationDate, editing.expirationManagementStatus)!=="MANAGED"} onClick={()=>void save("RESOLVED")} className="rounded-xl bg-emerald-600 px-3 py-3 font-black text-white">対応完了</button><button disabled={saving} onClick={()=>setEditing(null)} className="rounded-xl bg-slate-200 px-3 py-3 font-black">戻る</button></div><p className="mt-3 text-xs font-bold text-slate-500">更新者・時刻・変更前後の内容は在庫イベント履歴へ記録されます。</p></section></div>}
  </main>;
}
