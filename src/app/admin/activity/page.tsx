"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import FeedbackToast from "@/components/common/FeedbackToast";

type Activity = {
  date: string;
  summary: {
    registeredItems: number;
    stocktakeRecords: number;
    inventoryEvents: number;
    adminActions: number;
  };
  items: Array<{ id: string; name: string; janCode: string | null; systemBarcode: string | null; createdAt: string }>;
  records: Array<{ id: string; countedQuantity: number; updatedAt: string; session: { id: string; title: string; operator: string | null }; inventoryInstance: { item: { name: string } } }>;
  inventoryEvents: Array<{ id: string; eventType: string; quantityChange: number; quantityAfter: number; reason: string | null; createdAt: string; performedBy: { displayName: string } | null; inventoryInstance: { item: { name: string } } }>;
  adminActions: Array<{ id: string; action: string; route: string | null; createdAt: string; adminUser: { displayName: string } }>;
};

const eventLabels: Record<string, string> = {
  OPENING_BALANCE: "初期在庫を登録",
  RECEIPT: "入庫",
  ISSUE: "出庫",
  TRANSFER_IN: "移動先へ入庫",
  TRANSFER_OUT: "移動元から出庫",
  STOCKTAKE: "棚卸結果を反映",
  ADJUSTMENT: "在庫数を調整",
  DISPOSAL: "廃棄",
  RETURN: "返品",
  IMPORT: "データ取込",
};

const actionLabels: Record<string, string> = {
  ITEM_REGISTER: "商品を登録",
  STOCKTAKE_REGISTER_UNLISTED_ITEM: "棚卸中に未登録商品を登録",
  ITEM_UPDATE: "商品情報を変更",
  INVENTORY_UPDATE: "在庫情報を変更",
  STOCKTAKE_APPLY: "棚卸結果を正式反映",
  USER_CREATE: "利用者を追加",
  USER_UPDATE: "利用者設定を変更",
  SYSTEM_OPERATION_MODE_UPDATE: "運用モードを変更",
};

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function monthDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const last = new Date(year, monthNumber, 0);
  const cells: Array<string | null> = Array(first.getDay()).fill(null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(`${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return cells;
}

export default function ActivityCalendarPage() {
  const today = localDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
  const days = useMemo(() => monthDays(month), [month]);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/activity?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          data && typeof data === "object" && "message" in data && typeof data.message === "string"
            ? data.message
            : "作業履歴を取得できませんでした。"
        );
      }
      setActivity(data as Activity);
    } catch (caught) {
      setActivity(null);
      setError(caught instanceof Error ? caught.message : "作業履歴を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(selectedDate); }, [load, selectedDate]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/activity?month=${encodeURIComponent(month)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: unknown) => {
        if (!cancelled && data && typeof data === "object" && "days" in data) {
          setMonthCounts((data as { days: Record<string, number> }).days);
        }
      })
      .catch(() => { if (!cancelled) setMonthCounts({}); });
    return () => { cancelled = true; };
  }, [month]);

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setMonth(date.slice(0, 7));
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 sm:p-8">
      <FeedbackToast message={error} tone="error" title="作業履歴エラー" onClose={() => setError("")} />
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black text-blue-700">ACTIVITY CALENDAR</p>
            <h1 className="mt-1 text-3xl font-black">日付別の作業・登録履歴</h1>
            <p className="mt-2 text-slate-700">日付を選ぶと、その日の商品登録、棚卸、在庫変更、管理操作を確認できます。</p>
          </div>
          <Link href="/admin" className="rounded-xl bg-slate-800 px-5 py-3 font-black text-white">管理者メニューへ</Link>
        </header>

        <div className="mt-7 grid gap-6 lg:grid-cols-[390px_1fr]">
          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 font-black" />
            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-black text-slate-500">
              {['日','月','火','水','木','金','土'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {days.map((date, index) => date ? (
                <button key={date} type="button" onClick={() => selectDate(date)} className={`relative aspect-square rounded-xl text-sm font-black transition ${date === selectedDate ? "bg-blue-700 text-white" : date === today ? "bg-blue-100 text-blue-900" : "bg-slate-50 hover:bg-slate-200"}`}>
                  {Number(date.slice(-2))}
                  {monthCounts[date] > 0 && (
                    <span className={`absolute bottom-1 right-1 rounded-full px-1.5 text-[9px] ${date === selectedDate ? "bg-white text-blue-800" : "bg-rose-600 text-white"}`}>
                      {monthCounts[date]}
                    </span>
                  )}
                </button>
              ) : <span key={`blank-${index}`} />)}
            </div>
            <input type="date" value={selectedDate} onChange={(event) => selectDate(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold" />
          </section>

          <section className="space-y-5">
            <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm">
              <h2 className="text-2xl font-black">{selectedDate} の作業</h2>
              {loading || !activity ? <p className="mt-3 text-slate-300">読み込み中…</p> : (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["商品登録", activity.summary.registeredItems],
                    ["棚卸入力", activity.summary.stocktakeRecords],
                    ["在庫変更", activity.summary.inventoryEvents],
                    ["管理操作", activity.summary.adminActions],
                  ].map(([label, count]) => <div key={String(label)} className="rounded-2xl bg-white/10 p-3"><p className="text-xs font-bold text-slate-300">{label}</p><p className="mt-1 text-2xl font-black">{count}</p></div>)}
                </div>
              )}
            </div>

            {activity && (
              <>
                <div className="flex flex-wrap gap-3 print:hidden">
                  <button type="button" onClick={() => window.print()} className="rounded-xl bg-blue-700 px-5 py-3 font-black text-white">この日のジャーナルを印刷</button>
                  <button type="button" onClick={() => void load(selectedDate)} className="rounded-xl bg-white px-5 py-3 font-black text-slate-900 shadow-sm">最新情報に更新</button>
                </div>
                <div className="rounded-3xl bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xl font-black">登録商品</h3>
                    <Link href={`/items?registeredDate=${selectedDate}`} className="rounded-xl bg-emerald-600 px-4 py-2 font-black text-white">この日の登録分を表示・印刷</Link>
                  </div>
                  <div className="mt-4 space-y-2">{activity.items.length ? activity.items.map((item) => <Link key={item.id} href={`/items/${item.id}`} className="block rounded-xl bg-slate-50 p-3 font-bold hover:bg-slate-100">{new Date(item.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}　{item.name}<span className="ml-2 font-mono text-xs text-slate-600">{item.janCode || item.systemBarcode || "コードなし"}</span></Link>) : <p className="text-slate-600">登録はありません。</p>}</div>
                </div>

                <div className="rounded-3xl bg-white p-5 shadow-sm">
                  <h3 className="text-xl font-black">棚卸・在庫作業</h3>
                  <div className="mt-4 space-y-2">{[...activity.records.map((record) => ({ id: `r-${record.id}`, at: record.updatedAt, href: `/stocktake/${record.session.id}`, text: `棚卸「${record.session.title}」 ${record.inventoryInstance.item.name}：実数 ${record.countedQuantity}（担当：${record.session.operator || "未設定"}）` })), ...activity.inventoryEvents.map((event) => ({ id: `e-${event.id}`, at: event.createdAt, href: null, text: `${event.inventoryInstance.item.name}：${eventLabels[event.eventType] || event.eventType}（増減 ${event.quantityChange >= 0 ? "+" : ""}${event.quantityChange}、変更後 ${event.quantityAfter}）／操作：${event.performedBy?.displayName || "システム"}` }))].sort((a,b) => a.at.localeCompare(b.at)).map((entry) => entry.href ? <Link href={entry.href} key={entry.id} className="block rounded-xl bg-slate-50 p-3 text-sm font-semibold hover:bg-slate-100"><span className="mr-3 font-mono text-slate-500">{new Date(entry.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>{entry.text}<span className="ml-2 text-blue-700">確認・変更へ</span></Link> : <p key={entry.id} className="rounded-xl bg-slate-50 p-3 text-sm font-semibold"><span className="mr-3 font-mono text-slate-500">{new Date(entry.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>{entry.text}</p>)}</div>
                </div>

                <div className="rounded-3xl bg-white p-5 shadow-sm">
                  <h3 className="text-xl font-black">管理操作</h3>
                  <div className="mt-4 space-y-2">{activity.adminActions.length ? activity.adminActions.map((entry) => <p key={entry.id} className="rounded-xl bg-slate-50 p-3 text-sm font-semibold"><span className="mr-3 font-mono text-slate-500">{new Date(entry.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>{entry.adminUser.displayName}：{actionLabels[entry.action] || entry.action}</p>) : <p className="text-slate-600">管理操作はありません。</p>}</div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
