"use client";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { fetchFresh } from "@/lib/fetch-fresh";
import Link from "@/components/auth/PermissionLink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Modal from "@/components/common/Modal";
import FeedbackToast from "@/components/common/FeedbackToast";
import { journalRows, journalTime, type Activity, type JournalRow } from "@/lib/activity-journal";
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
const kinds = ["商品登録", "棚卸入力", "在庫変更", "変更・承認"];

export default function ActivityCalendarPage() {
  const today = dateKeyInJapan();
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedEntry, setSelectedEntry] = useState<JournalRow | null>(null);
  const [printDetails, setPrintDetails] = useState(false);
  const [printConfirmOpen, setPrintConfirmOpen] = useState(false);
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
  const changeCount = rows.filter(row=>row.kind === "変更・承認").length;
  const shown = useMemo(() => { const q = search.normalize("NFKC").trim().toLocaleLowerCase("ja"); return rows.filter(row => (kind === "すべて" || row.kind === kind) && [row.subject, row.detail, row.operator, ...row.fields.map(field => field.label + " " + (field.before ?? "") + " " + field.value)].join(" ").normalize("NFKC").toLocaleLowerCase("ja").includes(q)); }, [rows, kind, search]);
  return <main className="journal-page min-h-screen bg-slate-100 p-3 text-slate-950 sm:p-6">
    <style>{
      ".journal-list .entry{display:grid;grid-template-columns:52px 90px minmax(0,1fr) 110px;gap:12px;align-items:start;padding:14px 12px;border-bottom:1px solid #dbe2ea}.journal-list .entry:nth-child(even){background:#f8fafc}.journal-list .entry-time{font:600 14px/24px monospace;color:#475569}.journal-list .entry-kind{display:inline-block;width:fit-content;border:1px solid #cbd5e1;border-radius:5px;padding:3px 6px;font-size:12px;font-weight:700;white-space:nowrap;background:#f1f5f9;color:#334155}.journal-list [data-kind='商品登録']{background:#eff6ff;color:#1e40af;border-color:#bfdbfe}.journal-list [data-kind='棚卸入力']{background:#ecfdf5;color:#065f46;border-color:#a7f3d0}.journal-list [data-kind='在庫変更']{background:#fffbeb;color:#92400e;border-color:#fde68a}.journal-list .entry-subject{font-size:16px;font-weight:700;line-height:1.5;overflow-wrap:anywhere;color:#0f172a}.journal-list a.entry-subject:hover{text-decoration:underline;color:#1d4ed8}.journal-list .entry-detail{font-size:14px;line-height:1.6;color:#475569;margin-top:4px;overflow-wrap:anywhere}.journal-list .entry-operator{font-size:13px;line-height:24px;color:#475569;overflow-wrap:anywhere}.journal-list .list-head{display:grid;grid-template-columns:52px 90px minmax(0,1fr) 110px;gap:12px;padding:9px 12px;background:#e2e8f0;color:#334155;font-size:12px;font-weight:700;border-bottom:1px solid #cbd5e1}@media screen and (max-width:639px){.journal-list .list-head{display:none}.journal-list .entry{grid-template-columns:48px auto minmax(0,1fr);gap:8px;padding:14px 10px}.journal-list .entry-content{grid-row:2;grid-column:1/-1}.journal-list .entry-operator{text-align:right}.journal-list .entry-detail{font-size:14px}}" +
      "@media print { @page { size:A4 portrait; margin:12mm; } html,body,#main-content,.journal-page{min-height:0!important;background:white!important;padding:0!important;margin:0!important;color:black!important} .journal-print{display:block!important;font:10pt/1.4 Arial,sans-serif} .journal-print h1{font-size:16pt;font-weight:700;margin:0 0 2mm}.journal-print .totals{margin:0 0 4mm;font-size:9pt;line-height:1.5}.journal-print table{font:inherit;width:100%;border-collapse:collapse;table-layout:fixed}.journal-print th,.journal-print td{padding:1.4mm 1.8mm;border-bottom:.2mm solid #aaa;text-align:left;vertical-align:top;overflow-wrap:anywhere}.journal-print th{font-size:9pt;background:#eee;border-top:.4mm solid black;border-bottom:.4mm solid black}.journal-print thead{display:table-header-group}.journal-print tr{break-inside:avoid}.journal-print td:first-child{font-variant-numeric:tabular-nums;white-space:nowrap}.journal-print .detail{font-size:9pt;line-height:1.4;color:#222;margin-top:.8mm}.journal-print .time{width:16mm}.journal-print .kind{width:21mm}.journal-print .operator{width:25mm} }"
    }</style>
    <div className="mx-auto max-w-6xl print:hidden">
      <FeedbackToast message={error} tone="error" title="作業履歴エラー" onClose={() => setError("")} />
      <header className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-black">作業ジャーナル</h1><Link href="/admin" className="rounded-lg border bg-white px-3 py-2 font-bold">管理者メニュー</Link></header>
      <section className="mt-3 rounded-xl bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2">
          <button onClick={() => selectDate(shiftDate(selectedDate, -1))} className="rounded-lg border px-3 py-2 font-bold">前日</button>
          <input aria-label="作業日" type="date" value={selectedDate} onChange={event => selectDate(event.target.value)} className="min-w-0 rounded-lg border p-2 font-bold"/>
          <button onClick={() => selectDate(shiftDate(selectedDate, 1))} className="rounded-lg border px-3 py-2 font-bold">翌日</button>
          <button onClick={() => selectDate(today)} className="rounded-lg border px-3 py-2 font-bold">今日</button>
          <button aria-expanded={showCalendar} onClick={() => setShowCalendar(value => !value)} className="rounded-lg border px-3 py-2">カレンダー</button>
        </div><div className="flex flex-wrap items-center gap-2">
          <button disabled={!ready} onClick={() => setPrintConfirmOpen(true)} className="rounded-lg bg-blue-700 px-3 py-2 font-bold text-white disabled:opacity-40">この日の全件を印刷</button>
          <button disabled={loading} onClick={() => void load(selectedDate)} className="rounded-lg border px-3 py-2 disabled:opacity-40">更新</button>
        </div></div>
        {showCalendar && <div className="mt-3 max-w-sm rounded-xl border p-3"><input aria-label="カレンダーの月" type="month" value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }} className="w-full rounded-lg border p-2"/><div className="mt-2 grid grid-cols-7 gap-1 text-center">{["日","月","火","水","木","金","土"].map(day => <span key={day} className="text-xs">{day}</span>)}{days.map((date, index) => date ? <button key={date} aria-label={date} aria-pressed={selectedDate === date} onClick={() => selectDate(date)} className={"rounded-lg py-2 text-sm " + (date === selectedDate ? "bg-blue-700 text-white" : "bg-slate-100")}><span>{Number(date.slice(-2))}</span>{monthCounts[date] > 0 && <small className="block text-[10px]">{monthCounts[date]}件</small>}</button> : <span key={index}/>)}</div></div>}
      </section>
      <section className="mt-3 rounded-xl bg-white p-3">
        <div className="flex flex-wrap gap-2">{["すべて", ...kinds].map(value => <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)} className={"rounded-lg border px-3 py-2 text-sm font-bold " + (kind === value ? "bg-slate-900 text-white" : "bg-white")}>{value} {ready ? (value === "すべて" ? rows.length : rows.filter(row => row.kind === value).length) : "—"}</button>)}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><input type="search" aria-label="作業履歴を検索" value={search} onChange={event => setSearch(event.target.value)} placeholder="JAN・在庫No.・商品名・担当者で検索" className="min-w-0 flex-1 rounded-lg border p-2"/>{(search || kind !== "すべて") && <button onClick={() => {setSearch("");setKind("すべて");}} className="rounded-lg border p-2">絞り込み解除</button>}<Link href={"/items?registeredDate=" + selectedDate} className="rounded-lg border p-2 text-sm font-bold">登録商品のJAN印刷</Link></div>
        <p role="status" className="my-2 text-xs text-slate-600">{ready ? "表示 " + shown.length + "件 ／ この日の全 " + rows.length + "件。印刷は検索条件にかかわらず全件です。" : loading ? "読み込み中…" : "履歴を取得できませんでした。「更新」で再取得できます。"}</p>
        {ready && <div className="journal-list overflow-hidden rounded-xl border border-slate-200"><div className="list-head" aria-hidden="true"><span>時刻</span><span>作業</span><span>商品・作業内容</span><span>担当者</span></div>{shown.length ? shown.map(row => <article key={row.id} className="entry"><time className="entry-time">{journalTime(row.at)}</time><span className="entry-kind" data-kind={row.kind}>{row.kind}</span><div className="entry-content min-w-0">{row.href ? <Link href={row.href} className="entry-subject">{row.subject}</Link> : <strong className="entry-subject">{row.subject}</strong>}{row.detail && <p className="entry-detail">{row.kind === "商品登録" ? "JAN：" : ""}{row.detail}</p>}<button onClick={() => setSelectedEntry(row)} aria-label={(row.kind === "商品登録" ? "登録内容を確認：" : row.kind === "棚卸入力" ? "棚卸の入力内容を確認：" : "変更内容・権限を確認：") + row.subject} className="mt-2 rounded-lg border bg-white px-3 py-1 text-sm font-bold text-blue-800">{row.kind === "商品登録" ? "登録内容を確認" : row.kind === "棚卸入力" ? "棚卸の入力内容を確認" : "変更内容・権限を確認"}</button></div><span className="entry-operator">{row.operator === "—" ? "" : row.operator}{row.accessLabel&&<small className="block text-xs">{row.accessLabel}</small>}</span></article>) : <p className="py-6 text-center text-slate-500">{rows.length ? "条件に一致する作業はありません。" : "この日の作業はありません。"}</p>}</div>}
      </section>
    </div>
    {selectedEntry && <Modal titleId="journal-entry-title" onClose={() => setSelectedEntry(null)} className="print:hidden"><h2 id="journal-entry-title" className="text-xl font-bold">{selectedEntry.kind === "商品登録" ? "登録内容" : selectedEntry.kind === "棚卸入力" ? "棚卸の入力内容" : "変更内容と権限"}</h2><p className="mt-2 text-sm text-slate-600">{selectedDate} {journalTime(selectedEntry.at)} ／ {selectedEntry.kind} ／ {selectedEntry.operator}</p><h3 className="my-3 break-words text-lg font-bold">{selectedEntry.subject}</h3>{selectedEntry.note && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm">{selectedEntry.note}</p>}<dl className="divide-y">{selectedEntry.fields.map((field,index)=><div key={index} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3"><dt className="text-sm font-bold text-slate-600">{field.label}</dt><dd className="break-words text-sm">{field.before!==undefined&&<p className="mb-1 text-slate-500">変更前：{field.before}</p>}<p className="font-bold">{field.before!==undefined?"変更後：":""}{field.value}</p></dd></div>)}</dl><div className="mt-4 flex flex-wrap justify-end gap-2">{selectedEntry.inventoryHref && selectedEntry.inventoryHref !== selectedEntry.href && <Link href={selectedEntry.inventoryHref} className="rounded-lg border px-4 py-3 font-bold">対象の在庫明細を開く</Link>}{selectedEntry.href&&<Link href={selectedEntry.href} className="rounded-lg bg-blue-700 px-4 py-3 font-bold text-white">{selectedEntry.href.startsWith("/items/") ? "対象の在庫情報を開く" : "棚卸の記録を開く"}</Link>}<button onClick={()=>setSelectedEntry(null)} className="rounded-lg border px-4 py-3 font-bold">閉じる</button></div></Modal>}
    {printConfirmOpen && <Modal titleId="journal-print-confirm-title" onClose={() => setPrintConfirmOpen(false)} className="print:hidden">
      <h2 id="journal-print-confirm-title" className="text-xl font-bold">ジャーナルの印刷</h2>
      <p className="mt-2 text-sm text-slate-600">日付と対象を確認してから印刷へ進んでください。</p>
      <dl className="my-4 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 rounded-xl bg-slate-50 p-4 text-sm">
        <dt className="text-slate-600">作業日</dt><dd className="font-bold">{selectedDate}</dd>
        <dt className="text-slate-600">対象</dt><dd className="font-bold">{ready ? "この日の全 " + rows.length + "件" : "取得中・確認できません"}</dd>
        <dt className="text-slate-600">用紙</dt><dd>A4・縦／本文10ポイント</dd>
      </dl>
      {ready && activity && <p className="mb-3 text-sm leading-relaxed text-slate-700">商品登録 {activity.summary.registeredItems}件 ／ 棚卸入力 {activity.summary.stocktakeRecords}件 ／ 在庫変更 {activity.summary.inventoryEvents}件 ／ 変更・承認 {changeCount}件</p>}
      <p className="text-sm leading-relaxed text-slate-600">検索・絞り込みにかかわらず、その日の全件を印刷します。カレンダーと操作ボタンは印刷しません。</p>
      <label className="mt-3 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={printDetails} onChange={event=>setPrintDetails(event.target.checked)}/>登録内容・変更前後も印刷する</label>
      {!ready && <p role="alert" className="mt-3 text-sm text-red-700">履歴の取得が完了してから印刷できます。</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button onClick={() => setPrintConfirmOpen(false)} className="rounded-lg border px-4 py-3 font-bold">戻る</button>
        <button disabled={!ready} onClick={() => { if (!ready) return; flushSync(() => setPrintConfirmOpen(false)); window.print(); }} className="rounded-lg bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-40">印刷設定へ進む</button>
      </div>
    </Modal>}
    <section className="journal-print hidden" aria-label="印刷用ジャーナル">
      <h1>作業ジャーナル ／ {selectedDate}</h1>
      {ready && activity ? <><p className="totals">全 {rows.length}件 ／ 商品登録 {activity.summary.registeredItems}・棚卸入力 {activity.summary.stocktakeRecords}・在庫変更 {activity.summary.inventoryEvents}・変更・承認 {changeCount}（時刻：日本時間）</p>{rows.length ? <table><thead><tr><th className="time">時刻</th><th className="kind">作業</th><th>商品・内容</th><th className="operator">担当者</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{journalTime(row.at)}</td><td>{row.kind}</td><td><strong>{row.subject}</strong>{row.detail && <div className="detail">{row.kind === "商品登録" ? "JAN：" : ""}{row.detail}</div>}{printDetails&&<div className="detail">{row.note&&<p>{row.note}</p>}{row.fields.map((field,index)=><p key={index}>{field.label}：{field.before!==undefined?field.before+" → ":""}{field.value}</p>)}</div>}</td><td>{row.operator}{row.accessLabel&&<div className="detail">{row.accessLabel}</div>}</td></tr>)}</tbody></table> : <p>この日の作業はありません。</p>}</> : <p>履歴の取得が完了していません。画面に戻って更新し、取得後に印刷してください。</p>}
    </section>
  </main>;
}
