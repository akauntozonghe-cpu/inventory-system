"use client";
import Image from "next/image";
import {useState} from "react";
export type PhotoItem={id:string;name:string;photos?:{id:string}[]};
export default function StocktakePhoto({item,large=false}:{item:PhotoItem;large?:boolean}){
  const photo=item.photos?.[0];const [failed,setFailed]=useState<string|null>(null);
  const src=photo?"/api/items/"+encodeURIComponent(item.id)+"/photos/"+encodeURIComponent(photo.id)+(large?"":"?thumbnail=1"):"";
  return <div className={"mb-3 flex w-full items-center justify-center rounded-xl bg-slate-50 "+(large?"h-56":"h-40")}>
    {src&&failed!==src?<Image unoptimized src={src} width={large?640:240} height={large?448:160} alt={item.name+"の写真"} onError={()=>setFailed(src)} className="h-full w-full rounded-xl object-contain"/>:<span className="p-4 text-center text-sm text-slate-500">{src?"写真を読み込めませんでした":"写真未登録"}<span className="mt-1 block">商品名・分類・保管場所で確認してください</span></span>}
  </div>;
}
