"use client";
import ImeInput from "@/components/common/ImeInput";
import { useId } from "react";
import JanInput from "./JanInput";
type Codes = { janCode: string; systemBarcode: string; generateSystemBarcode: boolean };
export default function ProductCodeField({janCode,systemBarcode,generateSystemBarcode=false,onChange}:{janCode:string;systemBarcode:string;generateSystemBarcode?:boolean;onChange:(codes:Codes)=>void}) {
  const id=useId();
  const kind = systemBarcode || generateSystemBarcode ? "SYSTEM" : "JAN";
  const select=(next:"JAN"|"SYSTEM")=>{

    onChange(next === "SYSTEM" ? {janCode:"",systemBarcode,generateSystemBarcode:!systemBarcode} : {janCode,systemBarcode:"",generateSystemBarcode:false});
  };
  return <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
    <legend className="px-1 font-bold">商品コード</legend>
    <div className="flex flex-wrap gap-4">
      <label className="flex items-center gap-2"><ImeInput type="radio" name={id} checked={kind==="JAN"} onChange={()=>select("JAN")}/>既存JANを入力</label>
      <label className="flex items-center gap-2"><ImeInput type="radio" name={id} checked={kind==="SYSTEM"} onChange={()=>select("SYSTEM")}/>システムJANを自動採番</label>
    </div>
    {kind === "JAN" ? <JanInput required value={janCode} onChange={value=>onChange({janCode:value,systemBarcode:"",generateSystemBarcode:false})}/> : <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <p className="break-all font-mono">{systemBarcode || "保存時に13桁の番号を自動発行します"}</p>
      <p className="mt-1 text-sm text-slate-600">番号の手入力は不要です。発行済みの番号はそのまま使用します。</p>
    </div>}
  </fieldset>;
}
