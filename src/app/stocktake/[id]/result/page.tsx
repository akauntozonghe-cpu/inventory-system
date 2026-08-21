"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Mode = "ALL" | "DIFFERENCE" | "UNRECORDED";
type Data = {
  session: { id: string; title: string; status: string };
  summary: { targetCount: number; recordedCount: number; matchedCount: number; differenceCount: number; unrecordedCount: number };
  items: Array<{ id: string; name: string; janCode: string | null; location: string; expectedQuantity: number; countedQuantity: number | null; difference: number | null }>;
};

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [mode, setMode] = useState<Mode>("DIFFERENCE");

  useEffect(() => { fetch("/api/stocktake/session/" + id + "/result").then((res) => res.json()).then(setData).catch(console.error); }, [id]);
  if (!data) return <main className="p-6 text-white">結果を読み込み中...</main>;

  const visible = data.items.filter((item) => mode === "ALL" || (mode === "UNRECORDED" ? item.countedQuantity === null : item.difference !== null && item.difference !== 0));
  return <main className="mx-auto max-w-5xl p-4 text-white sm:p-8">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">棚卸結果</h1><p className="text-slate-300">{data.session.title}</p></div><Link href={"/stocktake/" + id} className="rounded-lg bg-blue-600 px-4 py-2">入力へ戻る</Link></div>
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">{[
      ["対象", data.summary.targetCount, "text-slate-900"], ["棚卸済", data.summary.recordedCount, "text-blue-600"], ["一致", data.summary.matchedCount, "text-green-600"], ["差異", data.summary.differenceCount, "text-red-600"], ["未棚卸", data.summary.unrecordedCount, "text-orange-600"],
    ].map(([label, value, color]) => <div key={String(label)} className="rounded-xl bg-white p-4 text-slate-800"><p className="text-sm text-slate-500">{label}</p><p className={"text-2xl font-bold " + color}>{value}</p></div>)}</div>
    <div className="mt-5 flex gap-2">{([["DIFFERENCE", "差異あり"], ["UNRECORDED", "未棚卸"], ["ALL", "すべて"]] as Array<[Mode, string]>).map(([value, label]) => <button key={value} onClick={() => setMode(value)} className={"rounded-full px-4 py-2 " + (mode === value ? "bg-blue-600" : "bg-white text-slate-700")}>{label}</button>)}</div>
    <section className="mt-4 overflow-hidden rounded-xl bg-white text-slate-800"><div className="divide-y">{visible.map((item) => <div key={item.id} className="p-4"><div className="flex justify-between gap-3"><strong>{item.name}</strong><span className={item.countedQuantity === null ? "text-orange-600" : item.difference === 0 ? "text-green-600" : "text-red-600"}>{item.countedQuantity === null ? "未棚卸" : item.difference === 0 ? "一致" : "差異 " + (item.difference > 0 ? "+" : "") + item.difference}</span></div><p className="mt-1 text-sm text-slate-600">棚：{item.location}　理論：{item.expectedQuantity}　棚卸：{item.countedQuantity ?? "-"}</p></div>)}</div></section>
  </main>;
}
