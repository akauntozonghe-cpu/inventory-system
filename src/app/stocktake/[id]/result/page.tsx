"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type Mode = "ALL" | "DIFFERENCE" | "UNRECORDED";
type ResultItem = { id: string; name: string; janCode: string | null; location: string; expectedQuantity: number; countedQuantity: number | null; difference: number | null };
type ResultData = { session: { id: string; title: string; status: "IN_PROGRESS" | "PAUSED" | "COMPLETED" }; summary: { targetCount: number; recordedCount: number; matchedCount: number; differenceCount: number; unrecordedCount: number }; items: ResultItem[] };

function isResultData(value: unknown): value is ResultData {
  return !!value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items);
}

export default function StocktakeResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ResultData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [completedMessage, setCompletedMessage] = useState("");
  const [mode, setMode] = useState<Mode>("DIFFERENCE");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/stocktake/session/${id}/result`);
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = payload && typeof payload === "object" && "message" in payload ? String(payload.message) : "結果を取得できませんでした";
          throw new Error(message);
        }
        if (!isResultData(payload)) throw new Error("結果データの形式が正しくありません。");
        setData(payload);
      } catch (cause) {
        console.error(cause);
        setError(cause instanceof Error ? cause.message : "結果を取得できませんでした");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const complete = async () => {
    if (!data || data.session.status === "COMPLETED") return;
    const text = data.summary.unrecordedCount > 0
      ? `未棚卸の商品が ${data.summary.unrecordedCount} 件あります。この内容で確定しますか？`
      : "この内容で棚卸を確定しますか？";
    if (!window.confirm(text)) return;
    setFinishing(true);
    try {
      // 確定時に在庫数と履歴へ反映する専用APIを呼ぶ。
      // 状態だけをCOMPLETEDにするAPIでは在庫数が変わらないため、ここでは使わない。
      const response = await fetch(`/api/stocktake/session/${id}/apply`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "棚卸を確定できませんでした");
      setCompletedMessage("棚卸データを送信しました。棚卸一覧へ戻ります...");
      window.setTimeout(() => router.push("/stocktake/start"), 2500);
    } catch (cause) {
      console.error(cause);
      alert(cause instanceof Error ? cause.message : "棚卸を確定できませんでした");
    } finally {
      setFinishing(false);
    }
  };

  if (loading) return <main className="min-h-screen bg-slate-50 p-6 text-slate-700">結果を読み込み中...</main>;
  if (error || !data) return <main className="min-h-screen bg-slate-50 p-6 text-slate-900"><div className="mx-auto max-w-xl rounded-3xl bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">棚卸結果を表示できません</h1><p className="mt-3 text-sm text-red-600">{error || "結果データがありません"}</p><Link href={`/stocktake/${id}`} className="mt-5 inline-block rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">棚卸入力へ戻る</Link></div></main>;

  const visibleItems = data.items.filter((item) => mode === "ALL" || (mode === "UNRECORDED" ? item.countedQuantity === null : item.difference !== null && item.difference !== 0));
  const filters: Array<[Mode, string]> = [["DIFFERENCE", "差異あり"], ["UNRECORDED", "未棚卸"], ["ALL", "すべて"]];
  const isCompleted = data.session.status === "COMPLETED";

  return <main className="min-h-screen bg-slate-50 text-slate-900"><div className="mx-auto max-w-5xl p-4 sm:p-8">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold sm:text-3xl">棚卸結果</h1><p className="mt-1 text-slate-500">{data.session.title}</p><p className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold ${isCompleted || completedMessage ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>{isCompleted || completedMessage ? "棚卸を終了しました" : "終了前の確認"}</p></div><div className="flex gap-2">{isCompleted || completedMessage ? <Link href="/stocktake/start" className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">棚卸一覧へ戻る</Link> : <><Link href={`/stocktake/${id}`} onClick={() => sessionStorage.setItem(`stocktake-work-access:${id}`, String(Date.now()))} className="rounded-xl bg-slate-700 px-4 py-3 font-bold text-white">入力へ戻る</Link><button type="button" onClick={complete} disabled={finishing} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:bg-slate-400">{finishing ? "確定中..." : "確定"}</button></>}</div></header>
    {completedMessage ? <p className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{completedMessage}</p> : !isCompleted && <p className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">結果を確認してください。問題なければ「確定」を押すと、もう一度確認してから棚卸作業が終了します。</p>}
    <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">{[["対象", data.summary.targetCount, "text-slate-900"], ["棚卸済", data.summary.recordedCount, "text-blue-600"], ["一致", data.summary.matchedCount, "text-emerald-600"], ["差異", data.summary.differenceCount, "text-red-600"], ["未棚卸", data.summary.unrecordedCount, "text-orange-600"]].map(([label, value, color]) => <div key={String(label)} className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p></div>)}</section>
    <div className="mt-5 flex gap-2 overflow-x-auto pb-1">{filters.map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value)} className={`shrink-0 rounded-full px-4 py-2 font-bold ${mode === value ? "bg-blue-600 text-white" : "bg-white text-slate-700 shadow-sm"}`}>{label}</button>)}</div>
    <section className="mt-4 overflow-hidden rounded-3xl bg-white shadow-sm"><div className="divide-y">{visibleItems.map((item) => <article key={item.id} className="p-4 sm:p-5"><div className="flex justify-between gap-3"><h2 className="font-bold">{item.name}</h2><span className={`shrink-0 font-bold ${item.countedQuantity === null ? "text-orange-600" : item.difference === 0 ? "text-emerald-600" : "text-red-600"}`}>{item.countedQuantity === null ? "未棚卸" : item.difference === 0 ? "一致" : `差異 ${item.difference && item.difference > 0 ? "+" : ""}${item.difference}`}</span></div><p className="mt-2 text-sm text-slate-600">JAN：{item.janCode ?? "-"}　保管場所：{item.location}</p><p className="mt-1 text-sm text-slate-600">理論在庫：{item.expectedQuantity}　棚卸：{item.countedQuantity ?? "-"}</p></article>)}{visibleItems.length === 0 && <p className="p-8 text-center text-slate-500">該当する商品はありません。</p>}</div></section>
  </div></main>;
}
