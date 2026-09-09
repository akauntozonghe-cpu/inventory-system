import Link from "next/link";
import { summarizeStock, type LinkedStock } from "@/lib/stock-state";
export default function StockStateSummary({stocks,defaultUnit,itemId,inventoryId}:{stocks:LinkedStock[];defaultUnit?:string|null;itemId:string;inventoryId?:string}) {
  const rows=summarizeStock(stocks,defaultUnit);
  const linked=stocks.some(row=>row.marketplaceListings?.length||row.allocationType==="flea_market");
  const href="/marketplace?"+new URLSearchParams(inventoryId?{inventoryId}:{itemId});
  return <section aria-label="在庫とフリマの状態" className="my-3 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm">
    {rows.map(row=><div key={row.unit} className="space-y-2"><p className="font-bold">登録在庫 {row.quantity} {row.unit} <span className="text-teal-800">／ 通常在庫 {row.available} {row.unit}</span></p><div className="flex flex-wrap gap-2">
      {row.preparing>0&&<span className="rounded-lg bg-amber-100 px-2 py-1">フリマ準備 {row.preparing} {row.unit}</span>}
      {row.listed>0&&<span className="rounded-lg bg-violet-100 px-2 py-1">出品中 {row.listed} {row.unit}</span>}
      {row.shipping>0&&<span className="rounded-lg bg-orange-100 px-2 py-1">売却済み・発送前 {row.shipping} {row.unit}</span>}
      {row.shipped>0&&<span className="rounded-lg bg-slate-200 px-2 py-1">発送済み {row.shipped} {row.unit}（履歴）</span>}
      {row.unlistedAllocation&&<span>フリマ用の指定あり・出品未登録</span>}
      {row.quantity===0&&<span>登録在庫なし</span>}
    </div>{row.shortage>0&&<p className="font-bold text-red-700">確保数が登録在庫を{row.shortage} {row.unit}超えています。出品と現物を確認してください。</p>}</div>)}
    {linked&&<><p className="mt-2 text-xs text-slate-600">準備・出品中は登録在庫の内数です。売却済みは在庫から減算済みです。</p><Link href={href} className="mt-2 inline-block min-h-11 rounded-lg border bg-white px-3 py-2 font-bold text-violet-800">この商品のフリマ状況を見る</Link></>}
  </section>;
}
