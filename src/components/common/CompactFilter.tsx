"use client";
import { useId, useMemo, useRef, useState } from "react";
export default function CompactFilter({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
}) {
  const id = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState("");
  const visible = useMemo(() => options.filter(option => option.label.normalize("NFKC").toLowerCase().includes(query.normalize("NFKC").trim().toLowerCase())), [options, query]);
  return <details ref={details} className="mt-4 rounded-xl border bg-white p-3" onToggle={event => { if (!event.currentTarget.open) setQuery(""); }}>
    <summary className="cursor-pointer break-words font-bold">{label}：{options.find(option => option.value === value)?.label ?? value ?? "すべて"}</summary>
    <label htmlFor={id} className="mt-3 block text-sm">選択肢を検索</label>
    <input id={id} value={query} onChange={event => setQuery(event.target.value)} className="mt-1 w-full rounded-lg border p-3" />
    <div className="mt-2 max-h-60 overflow-y-auto" role="group" aria-label={label}>
      {visible.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} className={`block min-h-11 w-full rounded-lg px-3 py-2 text-left ${value === option.value ? "bg-blue-700 text-white" : "hover:bg-slate-100"}`} onClick={() => { onChange(option.value); if (details.current) { details.current.open = false; details.current.querySelector("summary")?.focus(); } }}>{option.label}</button>)}
      {!visible.length && <p className="p-3 text-sm">該当する選択肢がありません。</p>}
    </div>
  </details>;
}
