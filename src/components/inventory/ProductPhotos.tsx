"use client";
import Modal from "@/components/common/Modal";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
type Photo={id:string};
export default function ProductPhotos({itemId,canEdit=false,compact=false}:{itemId:string;canEdit?:boolean;compact?:boolean}){
  const [photos,setPhotos]=useState<Photo[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [expanded,setExpanded]=useState(false);
  const base="/api/items/"+encodeURIComponent(itemId)+"/photos";
  const load=useCallback(async()=>{const response=await fetch(base,{cache:"no-store"});if(!response.ok)throw new Error("写真を取得できませんでした。");setPhotos((await response.json()).photos);},[base]);
  useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
  const stale=useLiveRefresh(load);
  async function upload(file:File){
    setBusy(true);setError("");
    try {
      if(file.size>20_000_000)throw new Error("写真は20MB以内のものを選んでください。");
      const bitmap=await createImageBitmap(file);
      const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext("2d")!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",0.85));
      if(!blob)throw new Error("写真を変換できませんでした。");
      const response=await fetch(base,{method:"POST",headers:{"Content-Type":"image/jpeg"},body:blob});const result=await response.json();if(!response.ok)throw new Error(result.message||"保存できませんでした。");await load();
    }catch(e){setError(e instanceof Error?e.message:"写真を追加できませんでした。JPEG・PNGの画像でもう一度お試しください。");}finally{setBusy(false);}
  }
  async function remove(id:string){setBusy(true);setError("");try{const response=await fetch(base+"/"+id,{method:"DELETE"});if(!response.ok)throw new Error("写真を削除できませんでした。");await load();}catch(e){setError(e instanceof Error?e.message:"削除できませんでした。");}finally{setBusy(false);}}
  return <section className={compact?"min-w-0":"my-2 rounded-xl border bg-white p-3"}>
    <div className={compact?"flex flex-col items-start gap-1":"flex items-center gap-3"}>{photos[0]?<button type="button" onClick={()=>setExpanded(true)} aria-label="商品の写真を開く" className="shrink-0"><Image unoptimized width={96} height={72} src={base+"/"+photos[0].id+"?thumbnail=1"} alt="商品写真 1" className="h-18 w-24 rounded-lg object-contain"/></button>:<span className="text-xs text-slate-400">写真なし</span>}<button type="button" onClick={()=>setExpanded(true)} className="min-h-11 rounded-lg border px-3 text-sm font-bold">{photos.length?(compact?"写真 ":"写真を見る（")+photos.length+(compact?"枚":"枚）"):canEdit?"写真を追加":"写真を見る"}</button></div>
    {expanded&&<Modal titleId="product-photos-title" onClose={()=>{if(!busy)setExpanded(false);}} busy={busy}><h3 id="product-photos-title" className="font-bold">商品の写真（{photos.length}/5枚）</h3>
    {(error||stale)&&<p role="alert" className="mt-2 text-sm text-red-700">{error||"写真を更新できませんでした。"}<button type="button" className="ml-2 underline" onClick={()=>void load().then(()=>setError("")).catch(e=>setError(e.message))}>再読み込み</button></p>}
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo,i)=><div key={photo.id}><a href={base+"/"+photo.id} target="_blank" rel="noreferrer" aria-label={"写真"+(i+1)+"を拡大"}><Image unoptimized width={320} height={240} src={base+"/"+photo.id} alt={"商品写真 "+(i+1)} className="h-36 w-full rounded-xl bg-slate-50 object-contain"/></a>{canEdit&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm("この写真を削除しますか？"))void remove(photo.id);}} className="mt-1 min-h-11 rounded-lg border px-3 text-sm">写真を削除</button>}</div>)}</div>
    {!photos.length&&<p className="mt-3 text-sm text-slate-500">写真はまだありません。</p>}
    {canEdit&&photos.length<5&&<fieldset disabled={busy} className="mt-3 flex flex-wrap gap-3">{[false,true].map(camera=><label key={String(camera)} className="cursor-pointer rounded-xl border border-blue-300 px-4 py-3 text-sm font-bold text-blue-800">{camera?"カメラで撮影":"写真を選んで追加"}<input aria-label={camera?"カメラで撮影":"写真を選んで追加"} type="file" accept="image/*" capture={camera?"environment":undefined} className="sr-only" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value="";}}/></label>)}</fieldset>}
    {busy&&<p role="status" className="mt-2 text-sm">写真を保存しています…</p>}<button type="button" disabled={busy} onClick={()=>setExpanded(false)} className="mt-4 min-h-11 rounded-lg border px-4 font-bold">閉じる</button></Modal>}
  </section>;
}
