"use client";
import type { LabelScale, LabelProfile } from "@/lib/barcode-label";
export default function BarcodePrintOptions({ scale, onScale, includeName, onIncludeName, profile="STANDARD", onProfile }: { profile?:LabelProfile;onProfile?:(value:LabelProfile)=>void;scale: LabelScale; onScale: (value: LabelScale) => void; includeName: boolean; onIncludeName: (value: boolean) => void }) {
  return <div className="my-3 space-y-2 text-sm">
    {onProfile&&<label className="block font-bold">ラベルの形 <select aria-label="ラベルの形" value={profile} onChange={e=>onProfile(e.target.value as LabelProfile)} className="ml-2 rounded-lg border p-2"><option value="COMPACT">商品貼付用・横長（JAN-13の高さ短縮）</option><option value="STANDARD">標準比率（JISの寸法）</option></select></label>}
    <label className="block font-bold">JANの大きさ <select value={scale} onChange={e => onScale(Number(e.target.value) as LabelScale)} className="ml-2 rounded-lg border p-2"><option value={0.8}>小型（80%）</option><option value={1}>基本寸法（100%）</option></select></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={includeName} onChange={e => onIncludeName(e.target.checked)} />商品名も印刷する</label>
    {profile==="COMPACT"?<p>JAN-13は約{scale===0.8?"29.83×11.46":"37.29×14.08"}mm。GS1 Japanの高さ短縮の案内に沿った商品貼付用です。JIS標準寸法とは異なります。左右の余白・バーの幅・数字は維持します。JAN-8は標準比率です。まず1枚を印刷して読み取りを確認してください。</p>:<p>JAN-13：{scale === 0.8 ? "29.83×20.74" : "37.29×25.93"}mm（余白込み）。JAN-8：{scale === 0.8 ? "21.38×17.05" : "26.73×21.31"}mm。80%が規格の最小倍率です。商品名なしで余分なラベル領域を抑えます。バーの高さ・左右の白い余白は削りません。</p>}
  </div>;
}
