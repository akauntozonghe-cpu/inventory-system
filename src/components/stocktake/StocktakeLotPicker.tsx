"use client";
import ProductIdentity from "@/components/inventory/ProductIdentity";
import type { StocktakeSelectedItem } from "./StocktakeInputPanel";
import Modal from "@/components/common/Modal";

export default function StocktakeLotPicker<T extends StocktakeSelectedItem>({ candidates, onSelect, onClose }: {
  candidates: T[]; onSelect: (item: T) => void; onClose: () => void;
}) {
  return <Modal titleId="lot-picker-title" onClose={onClose}>
    <section className="mx-auto max-w-2xl rounded-3xl bg-white p-5">
      <div className="flex items-center justify-between gap-3"><h2 id="lot-picker-title" className="text-xl font-black">棚卸するロットを選択</h2><button type="button" onClick={onClose} className="rounded-xl bg-slate-100 p-3 font-bold">戻る</button></div>
      <p className="my-4 text-slate-600">同じコードで{candidates.length}件あります。ロットと保管場所を確認してください。</p>
      <div className="space-y-3">{candidates.map(item => <button key={item.id} type="button" onClick={() => onSelect(item)} className="w-full rounded-2xl border-2 border-slate-200 p-4 text-left hover:border-blue-500 focus:border-blue-500">
        <p className="font-black">{item.item.name}</p>
        <p className="mt-2 text-lg font-black text-blue-800">Lot：{item.lotNo || "未設定"}</p>
        <p className="mt-1 font-bold">保管場所：{item.storageLocation?.name || "未設定"}</p>
        <p>期限：{item.expirationDate || "未設定"} ／ {item.countedQuantity === null ? "未棚卸" : `入力済：${item.countedQuantity}`}</p>
        <ProductIdentity item={item.item} inventoryId={item.id}/>
      </button>)}</div>
    </section>
  </Modal>;
}
