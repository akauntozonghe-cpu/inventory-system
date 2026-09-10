"use client";
import { useState } from "react";
import { normalizeJanInput } from "@/lib/input-normalization";

export default function ProductCodeField({janCode,systemBarcode,onChange}:{janCode:string;systemBarcode:string;onChange:(codes:{janCode:string;systemBarcode:string})=>void}) {
  const [kind,setKind]=useState<"JAN"|"SYSTEM">(janCode.trim()?"JAN":systemBarcode.trim()?"SYSTEM":"JAN");
  const [switching,setSwitching]=useState(false);
  const system=kind==="SYSTEM";
  return <div className="space-y-2">
    <label className="block font-bold">{system?"システムJAN":"JANコード"}<input inputMode="numeric" maxLength={13} value={system?systemBarcode:janCode} onChange={event=>onChange(system?{janCode:"",systemBarcode:normalizeJanInput(event.target.value)}:{janCode:normalizeJanInput(event.target.value),systemBarcode:""})} className="mt-2 w-full rounded-xl border border-slate-300 p-3"/></label>
    <p className="text-xs text-slate-600">{system?"JANが付いていない商品に発行したコードです。変更した場合はラベルも印刷し直してください。":"商品に付いているJANを入力します。JANとシステムJANはどちらか一方を使用します。"}</p>
    {!switching?<button type="button" className="text-sm underline" onClick={()=>setSwitching(true)}>コードの種類を変更</button>:<div className="rounded-xl bg-amber-50 p-3 text-sm"><p>種類を変更すると、入力中のコードを空欄にします。保存するまでは登録内容は変わりません。</p><div className="mt-2 flex gap-3"><button type="button" className="rounded-lg border p-2" onClick={()=>{onChange({janCode:"",systemBarcode:""});setKind(system?"JAN":"SYSTEM");setSwitching(false);}}>{system?"商品にあるJANへ変更":"システムJANへ変更"}</button><button type="button" className="underline" onClick={()=>setSwitching(false)}>変更しない</button></div></div>}
  </div>;
}
