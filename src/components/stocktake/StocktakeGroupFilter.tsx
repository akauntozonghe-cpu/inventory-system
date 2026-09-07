"use client";
import { matchesStocktakeGroup, stocktakeGroups, type StocktakeGroup } from "@/lib/stocktake-groups";
export default function StocktakeGroupFilter({ sessions, value, onChange }: {
  sessions: { status: string }[]; value: StocktakeGroup; onChange: (value: StocktakeGroup) => void;
}) {
  return <div className="my-4 flex flex-wrap gap-2" aria-label="棚卸の状態で絞り込み">
    {stocktakeGroups.map(group => <button key={group.value} type="button" aria-pressed={value === group.value} onClick={() => onChange(group.value)} className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${value === group.value ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700"}`}>
      {group.label}（{sessions.filter(session => matchesStocktakeGroup(session.status, group.value)).length}）
    </button>)}
  </div>;
}
