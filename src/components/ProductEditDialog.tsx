"use client";
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/common/Modal";
import SelectOrCreate from "@/components/SelectOrCreate";
import { useRegistrationOptions } from "@/hooks/useRegistrationOptions";
import { fetchFresh } from "@/lib/fetch-fresh";
import { normalizeJanInput } from "@/lib/input-normalization";
import { unitValidationMessage } from "@/lib/unit";

type Product = { name: string; janCode: string; manufacturer: string; majorCategory: string; minorCategory: string; defaultUnit: string; updatedAt: string };
export default function ProductEditDialog({ itemId, onClose, onSaved }: { itemId: string; onClose: () => void; onSaved: () => void }) {
  const options = useRegistrationOptions();
  const original = useRef<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetchFresh(`/api/items/${encodeURIComponent(itemId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "商品情報を取得できませんでした。");
        if (active) { const loaded = Object.fromEntries(["name", "janCode", "manufacturer", "majorCategory", "minorCategory", "defaultUnit", "updatedAt"].map((key) => [key, data.item[key] ?? ""])) as Product; original.current = JSON.stringify(loaded); setProduct(loaded); }
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "読み込みに失敗しました。"); }
    })();
    return () => { active = false; };
  }, [itemId]);
  const change = (key: keyof Product, value: string) => setProduct((current) => current ? { ...current, [key]: value, ...(key === "majorCategory" ? { minorCategory: "" } : {}) } : current);
  const close = () => {
    if (saving) return;
    if ((product && JSON.stringify(product) !== original.current) || reason.trim()) {
      if (!window.confirm("未保存の変更があります。変更を破棄して閉じますか？")) return;
    }
    onClose();
  };
  return <Modal titleId="product-edit-title" busy={saving} onClose={close}>

    <h2 id="product-edit-title" className="text-2xl font-black">商品情報を編集</h2>
    <p className="my-3 text-sm">商品名・分類・標準単位は関連画面と他の端末にも反映されます。棚卸の入力途中の数量は保持します。</p>
    {error && <p role="alert" className="my-3 font-bold text-red-700">{error}</p>}
    {!product ? <p>商品情報を読み込み中…</p> : <form onSubmit={async (event) => {
      event.preventDefault();
      const unitError = unitValidationMessage(product.defaultUnit);
      if (unitError) { setError(unitError); return; }
      setSaving(true); setError("");
      try {
        const response = await fetchFresh(`/api/items/${encodeURIComponent(itemId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...product, reason, expectedUpdatedAt: product.updatedAt }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "保存に失敗しました。");
        onSaved();
      } catch (caught) { setError(caught instanceof Error ? caught.message : "保存に失敗しました。"); }
      finally { setSaving(false); }
    }}>
      <fieldset disabled={saving} className="space-y-4">
        <label className="block font-bold">商品名<input required maxLength={200} value={product.name} onChange={(event) => change("name", event.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
        <label className="block font-bold">JANコード<input inputMode="numeric" value={product.janCode} onChange={(event) => change("janCode", event.target.value)} onBlur={() => change("janCode", normalizeJanInput(product.janCode))} className="mt-1 w-full rounded-lg border p-3"/></label>
        <label className="block font-bold">メーカー<input maxLength={200} value={product.manufacturer} onChange={(event) => change("manufacturer", event.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
        <SelectOrCreate label="大分類" value={product.majorCategory} options={options.majorCategories} onChange={(value) => change("majorCategory", value)}/>
        <SelectOrCreate key={product.majorCategory} label="小分類" value={product.minorCategory} options={options.minorsFor(product.majorCategory)} onChange={(value) => change("minorCategory", value)}/>
        <SelectOrCreate label="単位" value={product.defaultUnit} options={options.units} onChange={(value) => change("defaultUnit", value)} required/>
        <label className="block font-bold">変更理由<input required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
        {options.failed && <p role="status">分類・単位の更新を確認できません。通信回復後に自動で再取得します。</p>}
        <button type="submit" className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white">{saving ? "保存中…" : "変更を保存"}</button>
      </fieldset>
    </form>}
    <button type="button" disabled={saving} onClick={close} className="mt-4 rounded-xl border px-5 py-3 font-bold">閉じる</button>
  </Modal>;
}
