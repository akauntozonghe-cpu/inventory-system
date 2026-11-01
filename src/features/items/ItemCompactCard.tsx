"use client";

import Image from "next/image";
import Link from "@/components/auth/PermissionLink";
import {displayUnit} from "@/lib/unit";
import InventoryStatusBadges from "@/components/inventory/InventoryStatusBadges";
import type {Item} from "./types";

type Props = {
  item: Item;
  selected: boolean;
  canSelect: boolean;
  archivedView: boolean;
  onToggle: () => void;
};

export default function ItemCompactCard({item,selected,canSelect,archivedView,onToggle}:Props){
  const active = item.inventoryInstances.filter(row => row.status !== "廃止");
  const quantities = new Map<string,number>();
  for (const stock of active) {
    const unit = displayUnit(stock.unit,item.defaultUnit);
    quantities.set(unit, (quantities.get(unit)??0) + stock.quantity);
  }
  const quantityLabel = [...quantities].map(([unit,value]) => `${value.toLocaleString("ja-JP")} ${unit}`).join(" / ") || "在庫なし";
  const locations = [...new Set(active.map(row=>row.storageLocation?.name).filter((value):value is string=>Boolean(value)))];
  const expiries = active
    .filter(row=>row.expirationManagementStatus!=="NO_EXPIRY" && row.expirationDate)
    .map(row=>row.expirationDate!)
    .sort();
  const code = item.janCode || item.systemBarcode || "コード未登録";
  return <article className={`min-w-0 overflow-hidden rounded-xl border bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md ${selected?"border-blue-500 ring-1 ring-blue-400":item.isArchived?"border-amber-300":"border-slate-200"}`}>
    <div className="p-3 sm:p-4">
      <div className="flex min-w-0 items-start gap-2.5">
        {canSelect && <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-slate-100" title={`${item.name}を選択`}><input type="checkbox" aria-label={`${item.name}を選択`} checked={selected} onChange={onToggle} className="h-5 w-5 cursor-pointer accent-blue-700"/></label>}
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50">
          {item.photos?.[0]
            ? <Image unoptimized width={56} height={56} alt={`${item.name}の写真`} src={`/api/items/${item.id}/photos/${item.photos[0].id}?thumbnail=1`} className="h-14 w-14 object-contain"/>
            : <span aria-hidden className="text-2xl text-slate-300">▣</span>}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="min-w-0"><Link href={`/items/${item.id}`} className="line-clamp-2 break-words text-sm font-black leading-5 text-slate-950 underline-offset-2 hover:text-blue-700 hover:underline sm:text-base">{item.name}</Link></h2>
          <p className="mt-1 truncate font-mono text-xs text-slate-500" title={code}>{code}</p>
          {item.isArchived && <span className="mt-1 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">削除済み</span>}
        </div>
      </div>
      <div className="mt-2"><InventoryStatusBadges item={item} stocks={active}/></div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="min-w-0"><dt className="text-xs text-slate-500">メーカー</dt><dd className="truncate font-semibold" title={item.manufacturer||"未設定"}>{item.manufacturer||"未設定"}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-slate-500">分類</dt><dd className="truncate font-semibold" title={[item.majorCategory,item.minorCategory].filter(Boolean).join(" / ")||"未設定"}>{[item.majorCategory,item.minorCategory].filter(Boolean).join(" / ")||"未設定"}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-slate-500">{archivedView?"保存数量（参考）":"現在庫"}</dt><dd className="break-words font-black text-blue-800">{quantityLabel}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-slate-500">在庫明細</dt><dd className="font-black">{active.length}件</dd></div>
        <div className="min-w-0"><dt className="text-xs text-slate-500">最も近い期限</dt><dd className="font-semibold">{expiries[0]?.slice(0,10)||"未設定"}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-slate-500">保管場所</dt><dd className="truncate font-semibold" title={locations.join(" / ")}>{locations.length ? locations.slice(0,2).join("・")+(locations.length>2?` ほか${locations.length-2}`:"") : "未設定"}</dd></div>
      </dl>
      {item.isArchived && item.archiveReason && <p className="mt-2 line-clamp-2 break-words rounded-lg bg-amber-50 p-2 text-xs text-amber-900">削除理由：{item.archiveReason}</p>}
      <div className="mt-3 border-t border-slate-100 pt-2">
        <Link href={`/items/${item.id}`} className="block rounded-lg px-2 py-2 text-center text-sm font-bold text-blue-700 hover:bg-blue-50">商品と在庫の詳細を見る</Link>
      </div>
      {active.length>0 && <details className="mt-1 rounded-lg border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">ロット別の在庫を見る（{active.length}件）</summary>
        <div className="max-h-52 space-y-1.5 overflow-y-auto border-t border-slate-200 p-2">
          {active.map(stock=><Link key={stock.id} href={`/items/${item.id}?inventoryId=${encodeURIComponent(stock.id)}`} className="block min-w-0 rounded-lg bg-white p-2 text-xs hover:bg-blue-50">
            <span className="flex items-start justify-between gap-2"><strong className="min-w-0 break-words">Lot：{stock.lotNo||"未設定"}</strong><span className="shrink-0 font-bold text-blue-800">{stock.quantity} {displayUnit(stock.unit,item.defaultUnit)}</span></span>
            <span className="mt-1 block truncate text-slate-600">期限：{stock.expirationManagementStatus==="NO_EXPIRY"?"期限なし":stock.expirationDate?.slice(0,10)||"未設定"} ／ {stock.storageLocation?.name||"場所未設定"}</span>
          </Link>)}
        </div>
      </details>}
    </div>
  </article>;
}
