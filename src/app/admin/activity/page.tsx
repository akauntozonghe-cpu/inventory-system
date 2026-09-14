"use client";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { fetchFresh } from "@/lib/fetch-fresh";
import Link from "@/components/auth/PermissionLink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FeedbackToast from "@/components/common/FeedbackToast";
import { journalRows, journalTime, type Activity } from "@/lib/activity-journal";
import { dateKeyInJapan } from "@/lib/expiry-management";

function shiftDate(date: string, days: number) {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function monthDays(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const [year, number] = month.split("-").map(Number);
  const cells: Array<string | null> = Array(new Date(Date.UTC(year, number - 1, 1)).getUTCDay()).fill(null);
  for (let day = 1; day <= new Date(Date.UTC(year, number, 0)).getUTCDate(); day++) cells.push(month + "-" + String(day).padStart(2, "0"));
  return cells;
}
const kinds = ["商品登録", "棚卸入力", "在庫変更", "管理操作"];

export default function ActivityCalendarPage() {
  const today = dateKeyInJapan();
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [showCalendar, setShowCalendar] = useState(false);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("すべて");
  const requestId = useRef(0);
  const days = useMemo(() => monthDays(month), [month]);
  const load = useCallback(async (date: string, silent = false) => {
    const id = ++requestId.current;
    if (!silent) setLoading(true);
    try {
      const response = await fetchFresh("/api/admin/activity?date=" + encodeURIComponent(date), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "作業履歴を取得できませんでした。");
      if (id === requestId.current) { setActivity(data as Activity); setError(""); }
    } catch (caught) {
      if (id !== requestId.current) return;
      setActivity(null);
      setError(caught instanceof Error ? caught.message : "作業履歴を取得できませんでした。");
      if (silent) throw caught;
    } finally { if (id === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => { const sequence = requestId; void load(selectedDate); return () => { sequence.current++; }; }, [load, selectedDate]);
  useEffect(() => {
    if (!showCalendar) return;
    let cancelled = false;
    setMonthCounts({});
    fetchFresh("/api/admin/activity?month=" + encodeURIComponent(month), { cache: "no-store" })
      .then(response => { if (!response.ok) throw new Error("月別の件数を取得できませんでした。"); return response.json(); })
      .then(data => { if (!cancelled) setMonthCounts(data.days ?? {}); })
      .catch(() => { if (!cancelled) setError("カレンダーの件数を取得できませんでした。日付を選んで履歴を確認できます。"); });
    return () => { cancelled = true; };
  }, [month, showCalendar]);
  useLiveRefresh(async () => { await load(selectedDate, true); if (showCalendar) { const response = await fetchFresh("/api/admin/activity?month=" + encodeURIComponent(month)); if (!response.ok) throw new Error("ACTIVITY_SYNC_FAILED"); const data = await response.json(); setMonthCounts(data.days ?? {}); } });
  const selectDate = (date: string) => { if (date === selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return; requestId.current++; setSelectedDate(date); setMonth(date.slice(0, 7)); };
  const ready = !loading && activity?.date === selectedDate;
  const rows = useMemo(() => activity ? journalRows(activity) : [], [activity]);
  const shown = useMemo(() => { const q = search.normalize("NFKC").trim().toLocaleLowerCase("ja"); return rows.filter(row => (kind === "すべて" || row.kind === kind) && [row.subject, row.detail, row.operator].join(" ").normalize("NFKC").toLocaleLowerCase("ja").includes(q)); }, [rows, kind, search]);
  return <main className="journal-page min-h-screen bg-slate-100 p-3 text-slate-950 sm:p-6">
    <style>{"@media print { @page { size:A4 portrait; margin:12mm; } html,body,#main-content,.journal-page{min-height:0!important;background:white!important;padding:0!important;margin:0!important;color:black!important} .journal-print{display:block!important;font:9pt/1.25 Arial,sans-serif} .journal-print h1{font-size:14pt;margin:0 0 2mm}.journal-print .totals{margin:0 0 3mm;font-size:9pt}.journal-print table{font:inherit;width:100%;border-collapse:collapse;table-layout:fixed}.journal-print th,.journal-print td{padding:.8mm 1.5mm;border-bottom:.2mm solid #bbb;text-align:left;vertical-align:top;overflow-wrap:anywhere}.journal-print th{border-top:.3mm solid black;border-bottom:.3mm solid black}.journal-print thead{display:table-header-group}.journal-print tr{break-inside:avoid}.journal-print .detail{font-size:8pt;color:#333}.journal-print .time{width:14mm}.journal-print .kind{width:19mm}.journal-print .operator{width:25mm} }"}</style>
    <div className="mx-auto max-w-6xl print:hidden">
      <FeedbackToast message={error} tone="error" title="作業履歴エラー" onClose={() => setError("")} />
      <header className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-black">作業ジャーナル</h1><Link href="/admin" className="rounded-lg border bg-white px-3 py-2 font-bold">管理者メニュー</Link></header>
      <section className="mt-3 rounded-xl bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => selectDate(shiftDate(selectedDate, -1))} className="rounded-lg border px-3 py-2 font-bold">前日</button>
          <input aria-label="作業日" type="date" value={selectedDate} onChange={event => selectDate(event.target.value)} className="min-w-0 rounded-lg border p-2 font-bold"/>
          <button onClick={() => selectDate(shiftDate(selectedDate, 1))} className="rounded-lg border px-3 py-2 font-bold">翌日</button>
          <button onClick={() => selectDate(today)} className="rounded-lg border px-3 py-2 font-bold">今日</button>
          <button aria-expanded={showCalendar} onClick={() => setShowCalendar(value => !value)} className="rounded-lg border px-3 py-2">カレンダー</button>
          <button disabled={!ready} onClick={() => window.print()} className="rounded-lg bg-blue-700 px-3 py-2 font-bold text-white disabled:opacity-40">この日の全件を印刷</button>
          <button disabled={loading} onClick={() => void load(selectedDate)} className="rounded-lg border px-3 py-2 disabled:opacity-40">更新</button>
        </div>
        {showCalendar && <div className="mt-3 max-w-sm rounded-xl border p-3"><input aria-label="カレンダーの月" type="month" value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }} className="w-full rounded-lg border p-2"/><div className="mt-2 grid grid-cols-7 gap-1 text-center">{["日","月","火","水","木","金","土"].map(day => <span key={day} className="text-xs">{day}</span>)}{days.map((date, index) => date ? <button key={date} aria-label={date} aria-pressed={selectedDate === date} onClick={() => selectDate(date)} className={"rounded-lg py-2 text-sm " + (date === selectedDate ? "bg-blue-700 text-white" : "bg-slate-100")}><span>{Number(date.slice(-2))}</span>{monthCounts[date] > 0 && <small className="block text-[10px]">{monthCounts[date]}件</small>}</button> : <span key={index}/>)}</div></div>}
      </section>
      <section className="mt-3 rounded-xl bg-white p-3">
        <div className="flex flex-wrap gap-2">{["すべて", ...kinds].map(value => <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)} className={"rounded-lg border px-3 py-2 text-sm font-bold " + (kind === value ? "bg-slate-900 text-white" : "bg-white")}>{value} {ready ? (value === "すべて" ? rows.length : rows.filter(row => row.kind === value).length) : "—"}</button>)}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><input type="search" aria-label="作業履歴を検索" value={search} onChange={event => setSearch(event.target.value)} placeholder="商品名・担当者・作業内容で検索" className="min-w-0 flex-1 rounded-lg border p-2"/>{(search || kind !== "すべて") && <button onClick={() => {setSearch("");setKind("すべて");}} className="rounded-lg border p-2">絞り込み解除</button>}<Link href={"/items?registeredDate=" + selectedDate} className="rounded-lg border p-2 text-sm font-bold">登録商品のJAN印刷</Link></div>
        <p role="status" className="my-2 text-xs text-slate-600">{ready ? "表示 " + shown.length + "件 ／ この日の全 " + rows.length + "件。印刷は検索条件にかかわらず全件です。" : loading ? "読み込み中…" : "履歴を取得できませんでした。「更新」で再取得できます。"}</p>
        {ready && <div className="divide-y">{shown.length ? shown.map(row => <article key={row.id} className="grid grid-cols-[42px_1fr] gap-2 py-2 text-sm"><time className="font-mono text-slate-600">{journalTime(row.at)}</time><div className="min-w-0"><div className="flex flex-wrap items-center gap-x-2"><span className="text-xs text-slate-600">{row.kind}</span>{row.href ? <Link href={row.href} className="break-words font-bold text-blue-800 underline">{row.subject}</Link> : <strong className="break-words">{row.subject}</strong>}<span className="text-xs text-slate-600">{row.operator === "—" ? "" : row.operator}</span></div>{row.detail && <p className="mt-1 break-words text-xs text-slate-700">{row.detail}</p>}</div></article>) : <p className="py-6 text-center text-slate-500">{rows.length ? "条件に一致する作業はありません。" : "この日の作業はありません。"}</p>}</div>}
      </section>
    </div>
    <section className="journal-print hidden" aria-label="印刷用ジャーナル">
      <h1>作業ジャーナル ／ {selectedDate}</h1>
      {ready && activity ? <><p className="totals">全 {rows.length}件 ／ 商品登録 {activity.summary.registeredItems}・棚卸入力 {activity.summary.stocktakeRecords}・在庫変更 {activity.summary.inventoryEvents}・管理操作 {activity.summary.adminActions}（時刻：日本時間）</p>{rows.length ? <table><thead><tr><th className="time">時刻</th><th className="kind">作業</th><th>商品・内容</th><th className="operator">担当者</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{journalTime(row.at)}</td><td>{row.kind}</td><td><strong>{row.subject}</strong>{row.detail && <div className="detail">{row.detail}</div>}</td><td>{row.operator}</td></tr>)}</tbody></table> : <p>この日の作業はありません。</p>}</> : <p>履歴の取得が完了していません。画面に戻って更新し、取得後に印刷してください。</p>}
    </section>
  </main>;
}
