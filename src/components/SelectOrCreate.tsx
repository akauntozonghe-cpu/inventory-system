"use client";
import { useId, useState } from "react";
import FieldScanButton,{type FieldScanValue} from "./FieldScanButton";

export default function SelectOrCreate({ value, options, onChange, label, required = false, scanKind, onScan }: {
  value: string; options: string[]; onChange: (value: string) => void; label: string; required?: boolean; scanKind?:FieldScanValue["kind"];onScan?:(value:FieldScanValue)=>void;
}) {
  const id = useId();
  const [creating, setCreating] = useState(false);
  const unique = Array.from(new Set(options.filter(Boolean)));
  const custom = creating || Boolean(value && !unique.includes(value));
  return <div className="mt-2 space-y-2">
    <div className="flex items-center gap-2"><select aria-label={`${label}を選択`} value={custom ? "__CREATE__" : value} required={required && !custom}
      onChange={(event) => { const next = event.target.value; setCreating(next === "__CREATE__"); onChange(next === "__CREATE__" ? "" : next); }}
      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3">
      <option value="">{label}を選択</option>
      {unique.map((option) => <option key={option} value={option}>{option}</option>)}
      <option value="__CREATE__">＋ 新しい{label}を追加</option>
    </select>{scanKind&&<FieldScanButton kind={scanKind} onRead={value=>{setCreating(false);if(onScan)onScan(value);else onChange(value.value);}}/>}</div>
    {custom && <><input id={id} aria-label={`新しい${label}`} value={value} maxLength={label.includes("単位") ? 30 : 100} required={required}
      onChange={(event) => onChange(event.target.value)} onBlur={() => onChange(value.normalize("NFKC").trim())}
      placeholder={`新しい${label}を入力`} className="w-full rounded-xl border border-blue-400 px-4 py-3" />
      <p className="text-xs text-slate-600">商品を保存すると、他の端末でも選べるようになります。</p></>}
  </div>;
}
