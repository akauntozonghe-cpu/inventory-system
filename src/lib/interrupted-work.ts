/** Temporary navigation context, scoped to this browser tab. No inventory edits are saved here. */
export const INTERRUPTED_WORK_KEY = "inventory:interrupted-work:v1";
export type InterruptedWork = {
  returnTo: string;
  title: string;
  detail: string;
  startedAt: number;
};
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function safeWorkReturn(value:unknown):string|null {
  if(typeof value!=="string" || value.length>400 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return null;
  try {
    const url=new URL(value,"https://inventory.invalid");
    if(url.origin!=="https://inventory.invalid" || url.username || url.password || !url.pathname.startsWith("/"))return null;
    return url.pathname+url.search+url.hash;
  }catch{return null;}
}

export function parseInterruptedWork(raw:string|null,now=Date.now()):InterruptedWork|null {
  if(!raw || raw.length>1500)return null;
  try {
    const value:unknown=JSON.parse(raw);
    if(!value || typeof value!=="object")return null;
    const row=value as Record<string,unknown>;
    const returnTo=safeWorkReturn(row.returnTo);
    if(!returnTo || typeof row.title!=="string" || typeof row.detail!=="string" ||
       !Number.isFinite(row.startedAt) || typeof row.startedAt!=="number" ||
       row.startedAt>now+60000 || now-row.startedAt>MAX_AGE_MS)return null;
    return {returnTo,title:row.title.slice(0,90),detail:row.detail.slice(0,160),startedAt:row.startedAt};
  }catch{return null;}
}
export function readInterruptedWork():InterruptedWork|null {
  if(typeof window==="undefined")return null;
  try{return parseInterruptedWork(sessionStorage.getItem(INTERRUPTED_WORK_KEY));}catch{return null;}
}
export function rememberInterruptedWork(value:Omit<InterruptedWork,"startedAt">):void {
  if(typeof window==="undefined")return;
  const returnTo=safeWorkReturn(value.returnTo);
  if(!returnTo)return;
  try{sessionStorage.setItem(INTERRUPTED_WORK_KEY,JSON.stringify({
    returnTo,title:value.title.slice(0,90),detail:value.detail.slice(0,160),startedAt:Date.now(),
  }));}catch{}
  window.dispatchEvent(new Event("inventory:interrupted-work-changed"));
}
export function clearInterruptedWork():void {
  if(typeof window==="undefined")return;
  try{sessionStorage.removeItem(INTERRUPTED_WORK_KEY);}catch{}
  window.dispatchEvent(new Event("inventory:interrupted-work-changed"));
}
