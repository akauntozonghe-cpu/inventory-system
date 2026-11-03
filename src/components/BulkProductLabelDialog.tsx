"use client";

import {useMemo,useState} from "react";
import Modal from "@/components/common/Modal";
import BarcodePrintOptions from "@/components/BarcodePrintOptions";
import {barcodeLabel,barcodePrintDocument,type LabelProfile,type LabelScale} from "@/lib/barcode-label";
import {productQrPrintDocument} from "@/lib/product-qr-print";

export type BatchProductLabel = {
  id:string;
  name:string;
  barcode:string|null;
};
type PrintMode="BARCODE"|"QR"|"BOTH";

export default function BulkProductLabelDialog({
  labels,onClose,onComplete,
}:{
  labels:BatchProductLabel[];
  onClose:()=>void;
  onComplete:()=>void;
}){
  const [mode,setMode]=useState<PrintMode>("BARCODE");
  const [layout,setLayout]=useState<"A4"|"LABEL">("A4");
  const [scale,setScale]=useState<LabelScale>(0.8);
  const [profile,setProfile]=useState<LabelProfile>("COMPACT");
  const [includeName,setIncludeName]=useState(false);
  const [copies,setCopies]=useState(1);
  const [excluded,setExcluded]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [opened,setOpened]=useState(false);
  const [notice,setNotice]=useState("");
  const chosen=useMemo(()=>labels.filter(row=>!excluded.includes(row.id)),[labels,excluded]);
  const errors=useMemo(()=>{
    const problems=new Map<string,string>();
    for(const row of labels){
      try{
        const barcode=barcodeLabel(row.barcode??"",scale,profile);
        if(mode==="BOTH"&&barcode.width>55){
          problems.set(row.id,"JANバーコードが60×70mmラベルの印字幅を超えます。QRのみを選ぶかコードを確認してください。");
        }
      }catch(error){
        problems.set(row.id,error instanceof Error?error.message:"コードを検証できませんでした。");
      }
    }
    return problems;
  },[labels,mode,profile,scale]);
  const invalid=chosen.some(row=>errors.has(row.id));
  const copiesValid=Number.isInteger(copies)&&copies>=1&&copies<=100;
  const total=copiesValid?chosen.length*copies:0;
  const disabled=busy||invalid||!chosen.length||!copiesValid||total>1000;
  const sample=useMemo(()=>{
    if(mode!=="BARCODE")return null;
    const first=chosen.find(row=>!errors.has(row.id));
    return first?barcodeLabel(first.barcode!,scale,profile):null;
  },[chosen,errors,mode,scale,profile]);

  async function openPreview(){
    if(disabled)return;
    // Open synchronously on click so iOS Safari and mobile browsers can show it.
    const tab=window.open("","_blank","width=900,height=700");
    if(!tab){setNotice("印刷プレビューが開けません。ポップアップを許可してください。");return;}
    tab.document.write('<!doctype html><html lang="ja"><title>印刷準備</title><body>ラベルを準備しています…</body></html>');
    setBusy(true);setNotice("");
    try{
      const response=await fetch("/api/print/authorize",{cache:"no-store"});
      if(!response.ok){
        const result:unknown=await response.json().catch(()=>null);
        const message=result && typeof result==="object" && "message" in result
          && typeof result.message==="string"?result.message:"印刷権限を確認できませんでした。";
        throw new Error(message);
      }
      const repeated=chosen.flatMap(row=>Array.from({length:copies},()=>row));
      let html:string;
      if(mode==="BARCODE"){
        html=barcodePrintDocument(
          repeated.map(row=>({name:row.name,barcode:row.barcode!})),
          layout,scale,includeName,profile
        );
      }else{
        // Existing scanners understand the registered product JAN/system JAN
        // as a raw code. Do not create a new, unrecognized QR payload.
        const QRCode=(await import("qrcode")).default;
        const qrRows=await Promise.all(chosen.map(async row=>({
          name:row.name,barcode:row.barcode!,
          image:await QRCode.toDataURL(row.barcode!,{
            width:600,margin:2,errorCorrectionLevel:"M",
          }),
        })));
        html=productQrPrintDocument(
          qrRows.flatMap(row=>Array.from({length:copies},()=>row)),
          mode,layout,scale,profile,true
        );
      }
      tab.document.open();tab.document.write(html);tab.document.close();
      setOpened(true);
      setNotice(`${total}枚の印刷プレビューを開きました。印刷倍率100%で、まず1枚の読み取りを確認してください。`);
    }catch(error){
      tab.close();
      setNotice(error instanceof Error?error.message:"印刷用データを作成できませんでした。");
    }finally{setBusy(false);}
  }

  return <Modal titleId="bulk-product-print-title" busy={busy} onClose={onClose}>
    <h2 id="bulk-product-print-title" className="text-xl font-black sm:text-2xl">JAN・商品QRをまとめて印刷</h2>
    <p className="mt-2 text-sm text-slate-600">複数商品を選んで、同じA4用紙またはラベル用紙にまとめて印刷します。</p>

    <fieldset className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <legend className="px-1 font-bold">1. 印刷する形式</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {([
          ["BARCODE","JANバーコードのみ"],
          ["QR","商品QRのみ"],
          ["BOTH","JAN＋QRを1枚に"],
        ] as const).map(([value,label])=><label key={value}
          className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-bold ${mode===value?"border-blue-600 bg-blue-50 text-blue-900":"border-slate-200 bg-white"}`}>
          <input type="radio" name="product-print-mode" checked={mode===value}
            onChange={()=>{setMode(value);setNotice("");}}/>{label}
        </label>)}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        商品QRはJANまたはシステムJANを格納します。既存のJAN・QR読取で同じ商品を検索でき、個別ロットの識別には使いません。
      </p>
    </fieldset>

    <section className="mt-4 rounded-xl border border-slate-200 p-3">
      <h3 className="font-bold">2. 用紙・枚数</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold">用紙
          <select value={layout} onChange={event=>setLayout(event.target.value as "A4"|"LABEL")}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2">
            <option value="A4">A4へまとめて配置</option>
            <option value="LABEL">ラベルプリンター（1枚ずつ）</option>
          </select>
        </label>
        <label className="text-sm font-bold">1商品あたりの印刷枚数
          <input type="number" inputMode="numeric" min={1} max={100} step={1}
            value={copies} onChange={event=>setCopies(Number(event.target.value))}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 p-2"/>
        </label>
      </div>
      {mode==="BARCODE"?
        <details className="mt-3 rounded-lg bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-bold">バーコードの大きさ・商品名・印字形状</summary>
          <BarcodePrintOptions scale={scale} onScale={setScale} profile={profile} onProfile={setProfile}
            includeName={includeName} onIncludeName={setIncludeName}/>
          {sample&&<p className="text-xs text-slate-600">最初のコード：{sample.width.toFixed(2)}×{sample.height.toFixed(2)}mm</p>}
        </details>:
        <p className="mt-3 text-sm text-slate-600">QR・JAN＋QRは商品名付き60×70mmラベル。A4なら9枚／ページです。</p>}
    </section>

    <section className="mt-4 rounded-xl border border-slate-200 p-3">
      <h3 className="font-bold">3. 印刷対象を確認する</h3>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="font-bold">対象 {chosen.length}商品・計 {total}枚</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg border px-3 py-2 text-sm font-bold"
            onClick={()=>setExcluded([])}>全件選択</button>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm font-bold"
            onClick={()=>setExcluded(labels.map(row=>row.id))}>選択解除</button>
        </div>
      </div>
      <div className="mt-3 max-h-64 space-y-2 overflow-auto">
        {labels.map(row=><label key={row.id} className={`block rounded-lg border p-3 ${errors.has(row.id)?"border-red-200 bg-red-50":"border-slate-200"}`}>
          <span className="flex items-start gap-3">
            <input type="checkbox" checked={!excluded.includes(row.id)}
              onChange={event=>setExcluded(current=>event.target.checked?current.filter(id=>id!==row.id):[...current,row.id])}
              className="mt-1 h-5 w-5 shrink-0"/>
            <span className="min-w-0 flex-1">
              <strong className="block break-words text-sm">{row.name}</strong>
              <span className="mt-1 block break-all font-mono text-xs text-slate-500">{row.barcode||"JAN・システムJAN未登録"}</span>
              {errors.has(row.id)&&<span className="mt-2 block text-xs font-bold text-red-800">{errors.get(row.id)}</span>}
            </span>
          </span>
        </label>)}
      </div>
      {invalid&&<p role="alert" className="mt-2 text-sm font-bold text-red-700">印刷できないコードがあります。商品情報を修正するか、その商品のチェックを外してください。</p>}
      {!copiesValid&&<p role="alert" className="mt-2 text-sm font-bold text-red-700">1商品あたり1～100枚の整数を指定してください。</p>}
      {total>1000&&<p role="alert" className="mt-2 text-sm font-bold text-red-700">1回の印刷は1000枚までです。対象または枚数を減らしてください。</p>}
    </section>

    {notice&&<p role="status" className="mt-3 rounded-lg bg-blue-50 p-3 text-sm font-bold text-slate-800">{notice}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={disabled} onClick={()=>void openPreview()}
        className="min-h-11 rounded-lg bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-40">
        {busy?"準備中…":`この内容で${total}枚をプレビュー`}
      </button>
      {opened&&<button type="button" disabled={busy} onClick={()=>{onComplete();onClose();}}
        className="min-h-11 rounded-lg bg-emerald-700 px-4 py-3 font-bold text-white">印刷を終えて選択をクリア</button>}
      <button type="button" disabled={busy} onClick={onClose}
        className="min-h-11 rounded-lg border px-4 py-3 font-bold">{opened?"選択を残して閉じる":"戻る"}</button>
    </div>
  </Modal>;
}
