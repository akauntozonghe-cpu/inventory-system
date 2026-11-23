"use client";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import Link from "@/components/auth/PermissionLink";
import {clearInterruptedWork,readInterruptedWork,type InterruptedWork} from "@/lib/interrupted-work";

/** Shown at the TOP of a temporary destination, across product search and product details. */
export default function InterruptedWorkBanner(){
  const pathname=usePathname();
  const [work,setWork]=useState<InterruptedWork|null>(null);
  useEffect(()=>{
    const reload=()=>setWork(readInterruptedWork());
    reload();
    window.addEventListener("inventory:interrupted-work-changed",reload);
    window.addEventListener("focus",reload);
    window.addEventListener("pageshow",reload);
    return ()=>{
      window.removeEventListener("inventory:interrupted-work-changed",reload);
      window.removeEventListener("focus",reload);
      window.removeEventListener("pageshow",reload);
    };
  },[pathname]);
  if(!work || pathname===work.returnTo.split(/[?#]/)[0])return null;
  return <section aria-label="中断中の作業" role="status" className="mx-auto mt-3 w-[calc(100%-2rem)] max-w-7xl rounded-xl border border-blue-300 bg-blue-50 p-3 text-blue-950 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-black">作業が途中です：{work.title}</p>
        <p className="mt-1 text-sm">{work.detail}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link href={work.returnTo} className="rounded-lg bg-blue-700 px-4 py-3 font-bold text-white">元の作業へ戻る</Link>
        <button type="button" onClick={()=>{clearInterruptedWork();setWork(null);}} className="rounded-lg border border-blue-300 bg-white px-3 py-3 font-bold">作業を終了</button>
      </div>
    </div>
  </section>;
}
