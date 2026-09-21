"use client";
import AppHeader from "@/components/layout/AppHeader";
import Modal from "./Modal";
import { setUnsavedWork } from "@/lib/navigation-draft";
import { canGoBack,installNavigationHistory } from "@/lib/navigation-history";
import { usePathname,useRouter } from "next/navigation";
import { useEffect,useLayoutEffect,useRef,useState } from "react";
import { pageParent,publicPage } from "@/lib/page-flow";
import { leaveCurrentStocktakes } from "@/hooks/useStocktakePresence";
export default function PageNavigation(){
 const pathname=usePathname(),router=useRouter(),dirty=useRef(false);
 const [destination,setDestination]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const parent=pageParent(pathname);
 useLayoutEffect(()=>installNavigationHistory({isDirty:()=>dirty.current,onLeave:()=>{dirty.current=false;setUnsavedWork(false);void leaveCurrentStocktakes().catch(()=>{});}}),[]);
 useEffect(()=>{
  dirty.current=false;setUnsavedWork(false);setDestination(null);
  const input=(event:Event)=>{const element=event.target as HTMLInputElement;if(element.closest("form")&&element.type!=="search"){dirty.current=true;setUnsavedWork(true);}};
  const draft=(event:Event)=>{dirty.current=Boolean((event as CustomEvent).detail?.dirty);setUnsavedWork(dirty.current);};
  const click=(event:MouseEvent)=>{const link=(event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement|null;if(!link||event.defaultPrevented||event.button!==0||link.target==="_blank"||link.origin!==location.origin||(link.pathname===location.pathname&&link.search===location.search)||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;if(dirty.current){event.preventDefault();event.stopPropagation();window.dispatchEvent(new Event("inventory:close-menu"));setDestination(link.pathname+link.search+link.hash);}};
  const back=(event:Event)=>{const fallback=(event as CustomEvent).detail?.fallback??parent.href;if(canGoBack())router.back();else if(dirty.current)setDestination(fallback);else{void leaveCurrentStocktakes().catch(()=>{});router.push(fallback);}};
  const before=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue="";}};
  document.addEventListener("input",input);document.addEventListener("click",click,true);window.addEventListener("inventory:draft",draft);window.addEventListener("inventory:back",back);window.addEventListener("beforeunload",before);
  return()=>{document.removeEventListener("input",input);document.removeEventListener("click",click,true);window.removeEventListener("inventory:draft",draft);window.removeEventListener("inventory:back",back);window.removeEventListener("beforeunload",before);};
 },[pathname,parent.href,router]);
 if(publicPage(pathname))return null;
 const move=async()=>{if(!destination)return;setBusy(true);try{await leaveCurrentStocktakes();dirty.current=false;setUnsavedWork(false);router.push(destination);setDestination(null);}finally{setBusy(false);}};
 return <><AppHeader parent={parent}/>{destination&&<Modal titleId="navigation-title" busy={busy} onClose={()=>setDestination(null)}><h2 id="navigation-title" className="text-xl font-bold">未保存の入力があります</h2><p className="my-3">保存せずに移動すると、編集中の内容は失われます。</p><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>setDestination(null)} className="rounded-xl bg-blue-700 p-3 font-bold text-white">編集を続ける</button><button disabled={busy} onClick={()=>void move()} className="rounded-xl border p-3 font-bold">保存せずに移動</button></div></Modal>}</>;
}
