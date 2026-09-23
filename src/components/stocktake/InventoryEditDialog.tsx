"use client";
import ImeInput from "@/components/common/ImeInput";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/common/Modal";
import SelectOrCreate from "@/components/SelectOrCreate";
import { useAppAccess } from "@/components/auth/AppAccessProvider";
import { useRegistrationOptions } from "@/hooks/useRegistrationOptions";
import { fetchFresh } from "@/lib/fetch-fresh";

type Form = {
  storageLocationId: string;
  majorCategory: string;
  minorCategory: string;
  lotNo: string;
  expirationDate: string;
  expirationNotApplicable: boolean;
  quantity: string;
};

export default function InventoryEditDialog({ inventoryId, onClose, onSaved }: {
  inventoryId: string; onClose: () => void; onSaved: () => void;
}) {
  const { can } = useAppAccess();
  const options = useRegistrationOptions();
  const [form, setForm] = useState<Form | null>(null);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const original = useRef("");
  const version = useRef("");
  const legacyNoManagement = useRef(false);
  const permitted = can("INVENTORY_EDIT");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetchFresh(`/api/inventory/${encodeURIComponent(inventoryId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "在庫明細を取得できませんでした。");
        if (!active) return;
        const stock = data.inventory;
        const loaded: Form = {
          storageLocationId: stock.storageLocationId ?? "",
          majorCategory: stock.majorCategory ?? stock.item.majorCategory ?? "",
          minorCategory: stock.minorCategory ?? stock.item.minorCategory ?? "",
          lotNo: stock.lotNo ?? "",
          expirationDate: stock.expirationDate ?? "",
          expirationNotApplicable: !stock.expirationDate && stock.expirationManagementStatus === "NO_EXPIRY",
          quantity: String(stock.quantity),
        };
        original.current = JSON.stringify(loaded);
        version.current = stock.updatedAt;
        legacyNoManagement.current = Boolean(stock.expirationDate) && stock.expirationManagementStatus === "NO_EXPIRY";
        setName(stock.item.name);
        setForm(loaded);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "読み込みに失敗しました。");
      }
    })();
    return () => { active = false; };
  }, [inventoryId]);

  const close = () => {
    if (saving) return;
    if ((form && JSON.stringify(form) !== original.current || reason.trim()) && !window.confirm("未保存の変更があります。変更を破棄して閉じますか？")) return;
    onClose();
  };
  const change = (field: keyof Form, value: string) => setForm(current => current ? { ...current, [field]: value } : current);

  return <Modal titleId="stock-edit-title" busy={saving} onClose={close}>
    <h2 id="stock-edit-title" className="text-2xl font-black">この在庫明細を編集</h2>
    <p className="mt-2 font-bold">{name}</p>
    <p className="my-3 text-sm">選択したLot・保管場所の明細だけを変更します。入力途中の棚卸数量とメモは保持します。</p>
    {!permitted && <p role="alert" className="my-3 font-bold text-red-700">在庫明細の編集権限がありません。管理者に付与を依頼してください。</p>}
    {error && <p role="alert" className="my-3 font-bold text-red-700">{error}</p>}
    {!form ? <p>読み込み中…</p> : <form onSubmit={async event => {
      event.preventDefault();
      if (!permitted) return;
      const quantity = Number(form.quantity.normalize("NFKC"));
      if (!form.quantity.trim() || !Number.isInteger(quantity) || quantity < 0) { setError("帳簿在庫数は0以上の整数で入力してください。"); return; }
      if (!reason.trim()) { setError("変更理由を入力してください。"); return; }
      setSaving(true); setError("");
      try {
        const response = await fetchFresh(`/api/inventory/${encodeURIComponent(inventoryId)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, quantity, reason, expectedUpdatedAt: version.current,
            expirationNotApplicable: form.expirationNotApplicable ? true : legacyNoManagement.current ? undefined : false,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "在庫明細を保存できませんでした。");
        onSaved();
      } catch (caught) { setError(caught instanceof Error ? caught.message : "保存に失敗しました。"); }
      finally { setSaving(false); }
    }}>
      <fieldset disabled={saving || !permitted} className="space-y-4">
        <label className="block font-bold">保管場所<select value={form.storageLocationId} onChange={event => change("storageLocationId", event.target.value)} className="mt-1 w-full rounded-xl border p-3"><option value="">未設定</option>{form.storageLocationId && !options.storageLocationOptions.some(option => option.id === form.storageLocationId) && <option value={form.storageLocationId}>現在の保管場所</option>}{options.storageLocationOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        <SelectOrCreate label="この在庫の大分類" value={form.majorCategory} options={options.majorCategories} onChange={value => setForm({ ...form, majorCategory: value, minorCategory: "" })}/>
        <SelectOrCreate label="この在庫の小分類" value={form.minorCategory} options={options.minorsFor(form.majorCategory)} onChange={value => change("minorCategory", value)}/>
        <label className="block font-bold">Lot<ImeInput value={form.lotNo} maxLength={100} onChange={event => change("lotNo", event.target.value)} className="mt-1 w-full rounded-xl border p-3"/></label>
        <label className="flex items-center gap-2 font-bold"><ImeInput type="checkbox" checked={form.expirationNotApplicable} onChange={event => setForm({ ...form, expirationNotApplicable: event.target.checked, expirationDate: "" })}/>期限なし</label>
        {!form.expirationNotApplicable && <div className="grid gap-3 sm:grid-cols-2">
          <label className="font-bold">期限（年月）<ImeInput type="month" value={form.expirationDate.length === 7 ? form.expirationDate : ""} onChange={event => change("expirationDate", event.target.value)} className="mt-1 w-full rounded-xl border p-3"/></label>
          <label className="font-bold">期限（年月日）<ImeInput type="date" value={form.expirationDate.length === 10 ? form.expirationDate : ""} onChange={event => change("expirationDate", event.target.value)} className="mt-1 w-full rounded-xl border p-3"/></label>
        </div>}
        <label className="block font-bold">帳簿在庫数<ImeInput required inputMode="numeric" value={form.quantity} onChange={event => change("quantity", event.target.value)} className="mt-1 w-full rounded-xl border p-3"/><span className="mt-1 block text-sm font-normal">棚卸で数えた数量とは別の、現在の帳簿上の在庫数です。</span></label>
        <label className="block font-bold">変更理由<ImeInput required maxLength={300} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded-xl border p-3"/></label>
        <button type="submit" className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white">{saving ? "保存中…" : "変更を保存"}</button>
      </fieldset>
    </form>}
    <button type="button" disabled={saving} onClick={close} className="mt-4 rounded-xl border px-5 py-3 font-bold">閉じる</button>
  </Modal>;
}
