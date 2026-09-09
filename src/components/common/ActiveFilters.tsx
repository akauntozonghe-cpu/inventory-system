"use client";
export default function ActiveFilters({filters,onClear}:{filters:Array<{label:string;value:string;remove:()=>void}>;onClear:()=>void}) {
 const active=filters.filter(row=>row.value);
 return <section aria-label="適用中の絞り込み" className="my-3 rounded-xl border bg-slate-50 p-3 text-sm"><p className="font-bold">表示条件：{active.length?`${active.length}件の条件を組み合わせています`:"絞り込みなし"}</p>{active.length>0&&<div className="mt-2 flex flex-wrap gap-2">{active.map(row=><button key={row.label} aria-label={`${row.label}の絞り込みを解除`} className="min-h-11 rounded-lg border bg-white px-3 py-2 text-left" onClick={row.remove}>{row.label}：<strong>{row.value}</strong> ×</button>)}<button className="min-h-11 px-3 underline" onClick={onClear}>すべて解除</button></div>}</section>;
}
