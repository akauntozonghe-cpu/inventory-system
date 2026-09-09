"use client";
import AppHeader from "@/components/layout/AppHeader";
import { setUnsavedWork } from "@/lib/navigation-draft";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { needsEntryRedirect, pageParent, publicPage } from "@/lib/page-flow";
import { leaveCurrentStocktakes } from "@/hooks/useStocktakePresence";

export default function PageNavigation() {
  const pathname=usePathname(),router=useRouter(),dirty=useRef(false);
  const [entryNotice,setEntryNotice]=useState(false);
  const [destination,setDestination]=useState<string|null>(null),[browserBack,setBrowserBack]=useState(false),[busy,setBusy]=useState(false);
  const parent=pageParent(pathname);
  useEffect(()=>{
    setEntryNotice(new URLSearchParams(location.search).get("notice")==="entry");
    const navigation=performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming|undefined;
    if(needsEntryRedirect(window.location.pathname,navigation?.type??"navigate",document.referrer,location.origin))router.replace("/?notice=entry");
    // Only the initial document entry is checked; normal in-app navigation uses links.
  },[router]);
  useEffect(()=>{
    dirty.current=false;setUnsavedWork(false);setDestination(null);setBrowserBack(false);
    if(publicPage(pathname))return;
    const url=location.href;
    if(history.state?.inventoryFlow!==url)history.pushState({...history.state,inventoryFlow:url},"",url);
    const currentState={...history.state,inventoryFlow:url};
    const back=(event:PopStateEvent)=>{event.stopImmediatePropagation();history.pushState(currentState,"",url);setBrowserBack(true);};
    const input=(event:Event)=>{const element=event.target as HTMLInputElement;if(element.closest("form")&&element.type!=="search"){dirty.current=true;setUnsavedWork(true);}};
    const draft=(event:Event)=>{dirty.current=Boolean((event as CustomEvent).detail?.dirty);setUnsavedWork(dirty.current);};
    const click=(event:MouseEvent)=>{
      const link=(event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement|null;
      if(!link||link.target==="_blank"||link.origin!==location.origin||link.pathname===location.pathname||event.ctrlKey||event.metaKey)return;
      if(dirty.current){window.dispatchEvent(new Event("inventory:close-menu"));event.preventDefault();event.stopPropagation();setDestination(link.pathname+link.search);}
    };
    const before=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue="";}};
    window.addEventListener("popstate",back,true);document.addEventListener("input",input);document.addEventListener("click",click,true);window.addEventListener("inventory:draft",draft);window.addEventListener("beforeunload",before);
    return()=>{window.removeEventListener("popstate",back,true);document.removeEventListener("input",input);document.removeEventListener("click",click,true);window.removeEventListener("inventory:draft",draft);window.removeEventListener("beforeunload",before);};
  },[pathname]);
  const move=async(href:string)=>{setBusy(true);await leaveCurrentStocktakes();dirty.current=false;setUnsavedWork(false);setBrowserBack(false);setDestination(null);router.push(href);setBusy(false);};
  if(publicPage(pathname))return null;
  return <>{entryNotice&&<p role="status" className="bg-blue-50 px-4 py-2 text-sm">作業はホームのメニューから開始してください。</p>}<AppHeader parent={parent}/>{(destination||browserBack)&&<div className="fixed inset-0 z-[550] grid place-items-center bg-slate-950/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="navigation-title" className="w-full max-w-md rounded-2xl bg-white p-5"><h2 id="navigation-title" className="text-xl font-black">{destination?"入力内容を確認してください":"画面内のボタンで移動してください"}</h2><p className="my-3">{destination?"保存していない入力があります。移動すると、この入力は引き継がれません。":"作業の順序を保つため、ブラウザの戻る・進むでは移動しません。画面内の戻る・次の操作を使ってください。"}</p><div className="flex flex-wrap gap-2"><button disabled={busy} className="rounded-xl bg-blue-700 p-3 font-bold text-white" onClick={()=>{setDestination(null);setBrowserBack(false);}}>この画面で続ける</button><button disabled={busy} className="rounded-xl border p-3 font-bold" onClick={()=>{if(!destination&&dirty.current){setDestination(parent.href);setBrowserBack(false);}else void move(destination??parent.href);}}>{destination?"保存せずに移動":parent.label}</button></div></section></div>}</>;
}
