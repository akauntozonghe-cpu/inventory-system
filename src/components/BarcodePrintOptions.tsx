"use client";
import type { LabelScale } from "@/lib/barcode-label";
export default function BarcodePrintOptions({ scale, onScale, includeName, onIncludeName }: { scale: LabelScale; onScale: (value: LabelScale) => void; includeName: boolean; onIncludeName: (value: boolean) => void }) {
  return <div className="my-3 space-y-2 text-sm">
    <label className="block font-bold">JANの大きさ <select value={scale} onChange={e => onScale(Number(e.target.value) as LabelScale)} className="ml-2 rounded-lg border p-2"><option value={0.8}>小型（80%）</option><option value={1}>基本寸法（100%）</option></select></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={includeName} onChange={e => onIncludeName(e.target.checked)} />商品名も印刷する</label>
    <p>JAN-13本体：{scale === 0.8 ? "29.83×20.74" : "37.29×25.93"}mm。用紙：{scale === 0.8 ? `32×${includeName ? 26 : 23}` : `40×${includeName ? 32 : 28}`}mm。数字・余白を含み、バーの高さは削りません。</p>
  </div>;
}
