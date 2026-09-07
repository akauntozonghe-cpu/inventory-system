"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchFresh } from "@/lib/fetch-fresh";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";

type Session = { id: string; title: string; scopeLabel: string | null; status: string; recordedCount: number; targetCount: number };
export default function ContinueStocktake() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetchFresh("/api/stocktake/session?all=false");
      if (!response.ok) throw new Error("棚卸を取得できません");
      const data = await response.json();
      if (!Array.isArray(data.sessions)) throw new Error("棚卸の形式が不正です");
      setSessions(data.sessions.filter((row: Session) => ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"].includes(row.status)));
      setLoaded(true); setError(false);
    } catch (caught) { setError(true); throw caught; }
  }, []);
  useEffect(() => { void refresh().catch(() => {}); }, [refresh]);
  const syncFailed = useLiveRefresh(refresh);
  return <section aria-labelledby="continue-stocktake-title" className="mt-6 rounded-3xl border border-teal-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-wider text-teal-700">自分の作業</p><h2 id="continue-stocktake-title" className="mt-1 text-xl font-black">続きから始める</h2></div><Link href="/stocktake/start" className="rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white">棚卸一覧・新規開始</Link></div>
    {(error || syncFailed) && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">最新の棚卸を確認できません。<button type="button" onClick={() => void refresh().catch(() => {})} className="ml-2 font-bold underline">再取得</button></p>}
    {!loaded && !error && <p role="status" className="mt-4 text-slate-600">作業状況を確認しています…</p>}
    {loaded && sessions.length === 0 && <p className="mt-4 text-sm text-slate-600">途中の棚卸はありません。新しい棚卸を開始できます。</p>}
    <div className="mt-4 grid gap-3 lg:grid-cols-3">{sessions.slice(0, 3).map(session => {
      const review = session.status === "REVIEW" || session.status === "CONFLICT";
      return <Link key={session.id} href={`/stocktake/${encodeURIComponent(session.id)}${review ? "/result" : ""}`} className="rounded-2xl border border-slate-200 p-4 transition hover:border-teal-500">
        <span className={`rounded-lg px-2 py-1 text-xs font-bold ${review ? "bg-amber-100 text-amber-900" : "bg-teal-100 text-teal-900"}`}>{review ? "結果の確認待ち" : session.status === "PAUSED" ? "中断中" : "棚卸中"}</span>
        <h3 className="mt-3 break-words font-black">{session.title}</h3><p className="mt-1 text-sm text-slate-600">{session.scopeLabel || "全体"}</p>
        <p className="mt-3 text-sm font-bold">{session.recordedCount} / {session.targetCount}件入力済み</p><p className="mt-2 text-sm font-bold text-teal-800">{review ? "メモ・差異を確認 →" : "続きを開く →"}</p>
      </Link>;
    })}</div>
    {sessions.length > 3 && <p className="mt-3 text-sm text-slate-600">ほかに{sessions.length - 3}件あります。棚卸一覧で確認できます。</p>}
  </section>;
}
