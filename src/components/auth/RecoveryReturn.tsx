"use client";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import {readRecoveryReturn,type RecoveryReturn,rememberRecoveryReturn} from "@/lib/recovery-return";
export default function RecoveryReturnButton(){
 const pathname=usePathname(),[pending,setPending]=useState<RecoveryReturn|null>(null);
 useEffect(()=>{const check=()=>setPending(readRecoveryReturn());check();window.addEventListener("inventory:recovery-return-changed",check);return()=>window.removeEventListener("inventory:recovery-return-changed",check);},[pathname]);
 if(!pending)return null;
 return <div className="flex items-center justify-between gap-2 border-t bg-blue-50 px-4 py-2 text-xs"><span>元の操作を確認したら、復旧の続きへ戻れます。</span><div className="flex shrink-0 gap-2"><button className="rounded-lg bg-blue-700 p-2 font-bold text-white" onClick={()=>window.dispatchEvent(new CustomEvent("inventory:resume-recovery",{detail:pending}))}>復旧の続き</button><button aria-label="復旧の続きの案内を閉じる" className="rounded-lg border p-2" onClick={()=>rememberRecoveryReturn(null)}>閉じる</button></div></div>;
}
