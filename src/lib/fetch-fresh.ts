/** Only reads are replayed automatically. An uncertain write must be reconciled, never blindly repeated. */
export async function fetchFresh(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const cancel = () => controller.abort();
  init.signal?.addEventListener("abort", cancel, { once: true });
  if (init.signal?.aborted) controller.abort();
  const readOnly = !init.method || ["GET","HEAD"].includes(init.method.toUpperCase());
  const attempts = readOnly ? 3 : 1;
  try {
    for(let attempt=0; attempt<attempts; attempt++) {
      try {
        const response=await fetch(url,{...init,cache:"no-store",signal:controller.signal});
        await response.clone().arrayBuffer();
        if([500,502,503,504].includes(response.status)&&attempt+1<attempts&&!controller.signal.aborted) {
          await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));continue;
        }
        if(response.status>=500) {
          const value=await response.clone().json().catch(()=>null);
          notifyReadFailure(url,value?.code||`HTTP_${response.status}`,value?.message||"通信を回復できませんでした。");
        }
        return response;
      } catch(error) {
        if(attempt+1<attempts&&!controller.signal.aborted) {await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));continue;}
        if(!init.signal?.aborted)notifyReadFailure(url,"NETWORK_ERROR","通信を回復できませんでした。");
        throw error;
      }
    }
    throw new Error("通信を完了できませんでした。");
  } finally {clearTimeout(timer);init.signal?.removeEventListener("abort",cancel);}
}
const reported = new Map<string,number>();
function notifyReadFailure(url:string,code:string,message:string) {
  if(typeof window==="undefined"||typeof window.dispatchEvent!=="function"||/\/api\/(?:error-reports|sync\/)|\/admin\/re-auth/.test(url))return;
  window.dispatchEvent(new CustomEvent("inventory:recovery-failed",{detail:{code,message}}));
  const route=window.location?.pathname; if(!route)return;
  const key=route+":"+code,now=Date.now();if(now-(reported.get(key)??0)<30000)return;reported.set(key,now);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
  void fetch("/api/error-reports",{method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({code,title:"通信の自動復旧失敗",message,route,severity:"ERROR"})}).then(async response=>{const value=await response.json();if(response.ok&&value.reportId)await fetch(`/api/error-reports/${encodeURIComponent(value.reportId)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({action:"ADMIN_REQUIRED"})});}).catch(()=>{}).finally(()=>clearTimeout(timer));
}
