"use client";
import ImeInput from "@/components/common/ImeInput";
import { useId, useState } from "react";
import FieldScanButton from "./FieldScanButton";
import { janCodeValidationMessage } from "@/lib/input-normalization";
export default function JanInput({ value, onChange, disabled = false, required = false }: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    required?: boolean;
}) { const id = useId(); const [blurred,setBlurred]=useState(false); const error = blurred ? janCodeValidationMessage(value) : null; return <div><div className="mt-2 flex items-center gap-2"><ImeInput required={required} aria-label="JANコード" value={value} disabled={disabled} inputMode="numeric" maxLength={100} aria-invalid={Boolean(error)} aria-describedby={error ? id : undefined} onFocus={()=>setBlurred(false)} onBlur={e=>{setBlurred(true);onChange(e.target.value.normalize("NFKC").replace(/[\s-]/g,""));}} onChange={e=>onChange(e.target.value)} placeholder="商品のJANを入力・読み取り" className="min-w-0 flex-1 rounded-xl border border-slate-300 p-3"/><FieldScanButton kind="JAN" disabled={disabled} onRead={code => onChange(code.value)}/></div>{error && <p id={id} role="alert" className="mt-1 text-sm text-red-700">入力したJAN「{value}」：{error}</p>}</div>; }
