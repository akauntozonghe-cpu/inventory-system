"use client";
import { useState } from "react";
import {janCodeValidationMessage} from "@/lib/input-normalization";
import FieldScanButton from "./FieldScanButton";
import {useId} from "react";

export default function ProductCodeField({janCode,systemBarcode,onChange}:{janCode:string;systemBarcode:string;onChange:(codes:{janCode:string;systemBarcode:string})=>void}) {
  const [kind,setKind]=useState<"JAN"|"SYSTEM">(janCode.trim()?"JAN":systemBarcode.trim()?"SYSTEM":"JAN");
  const [switching,setSwitching]=useState(false);
  const system=kind==="SYSTEM";
  const helpId=useId();
  const value=system?systemBarcode:janCode;
  const error=system&&/^SYS-/.test(value)?null:janCodeValidationMessage(value);
  const normalize=(raw:string)=>{const normalized=raw.normalize("NFKC").replace(/\s/g,"");return system&&normalized.startsWith("SYS-")?normalized:normalized.replace(/-/g,"");};
  return <div className="space-y-2"><div className="flex items-end gap-2">
    <label className="block min-w-0 flex-1 font-bold">{system?"システムJAN":"JANコード"}<input inputMode="numeric" maxLength={100} aria-invalid={Boolean(error)} aria-describedby={error?helpId:undefined} value={system?systemBarcode:janCode} onChange={event=>onChange(system?{janCode:"",systemBarcode:normalize(event.target.value)}:{janCode:normalize(event.target.value),systemBarcode:""})} className="mt-2 w-full rounded-xl border border-slate-300 p-3"/></label>{!system&&<FieldScanButton kind="JAN" onRead={code=>onChange({janCode:code.value,systemBarcode:""})}/>}</div>
    {error&&<p id={helpId} role="alert" className="text-sm font-bold text-red-700">この商品の{system?"システムJAN":"JAN"}「{value}」（{value.length}文字）：{error} 商品のバー下の数字を確認してください。足りない数字を推測して足したり、末尾を削ったりしないでください。</p>}
    <p className="text-xs text-slate-600">{system?"JANが付いていない商品に発行したコードです。変更した場合はラベルも印刷し直してください。":"商品に付いているJANを入力します。JANとシステムJANはどちらか一方を使用します。"}</p>
    {!switching?<button type="button" className="text-sm underline" onClick={()=>setSwitching(true)}>コードの種類を変更</button>:<div className="rounded-xl bg-amber-50 p-3 text-sm"><p>種類を変更すると、入力中のコードを空欄にします。保存するまでは登録内容は変わりません。</p><div className="mt-2 flex gap-3"><button type="button" className="rounded-lg border p-2" onClick={()=>{onChange({janCode:"",systemBarcode:""});setKind(system?"JAN":"SYSTEM");setSwitching(false);}}>{system?"商品にあるJANへ変更":"システムJANへ変更"}</button><button type="button" className="underline" onClick={()=>setSwitching(false)}>変更しない</button></div></div>}
  </div>;
}
