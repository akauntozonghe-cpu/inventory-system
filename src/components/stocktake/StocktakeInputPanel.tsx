"use client";
import { parseStocktakeQuantity, stepStocktakeQuantity } from "@/lib/stocktake-quantity";
import { displayUnit } from "@/lib/unit";

import { useEffect, useState, type RefObject } from "react";

export type StocktakeSelectedItem = {
  id: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  lotNo: string | null;
  expirationDate: string | null;
  unit: string | null;
  item: {
    name: string;
    janCode: string | null;
    systemBarcode: string | null;
    managementCode: string | null;
    managementGroupCode?: string | null;
    manufacturer: string | null;
    majorCategory: string | null;
    minorCategory: string | null;
    defaultUnit: string | null;
  };
  storageLocation: {
    name: string;
  } | null;
};

type Props = {
  selected: StocktakeSelectedItem | null;
  quantity: string;
  memo: string;
  onMemoChange: (value: string) => void;
  saving: boolean;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onQuantityChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  continuous?: boolean;
  onEditProduct?: () => void;
};

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-900">
        {value?.trim() || "-"}
      </dd>
    </div>
  );
}

export default function StocktakeInputPanel({
  selected,
  quantity,
  memo,
  onMemoChange,
  saving,
  disabled,
  inputRef,
  onQuantityChange,
  onSave,
  onCancel,
  continuous = false,
  onEditProduct,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    setDetailsOpen(false);
  }, [selected?.id]);

  if (!selected) {
    return (
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <p className="text-sm font-black text-blue-600">
          {continuous ? "連続スキャン中" : "棚卸入力"}
        </p>

        <h2 className="mt-2 text-xl font-black text-slate-950">
          商品を選ぶか、バーコードを読み取ってください
        </h2>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          読み取った商品と数量入力が、ここに表示されます。
        </p>
      </section>
    );
  }

  const countedQuantity = parseStocktakeQuantity(quantity);
  const isValidQuantity = countedQuantity !== null;

  const difference = countedQuantity !== null
    ? countedQuantity - selected.expectedQuantity
    : null;

  const unit = displayUnit(selected.unit, selected.item.defaultUnit);
  const alreadyRecorded = selected.countedQuantity !== null;

  const category = [
    selected.item.majorCategory,
    selected.item.minorCategory,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" / ");

  const differenceStyle =
    difference === null
      ? "bg-slate-100 text-slate-600"
      : difference === 0
        ? "bg-emerald-100 text-emerald-700"
        : "bg-red-100 text-red-700";

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
      {onEditProduct && <button type="button" disabled={saving} onClick={onEditProduct} className="mb-3 rounded-xl border border-blue-300 p-3 font-bold text-blue-700">商品情報を編集する</button>}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-blue-600">{continuous ? "連続スキャン・棚卸入力" : "棚卸入力"}</p>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${alreadyRecorded ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
              {alreadyRecorded ? "棚卸済" : "未棚卸"}
            </span>
          </div>

          <h2 className="mt-1 break-words text-xl font-black text-slate-950 sm:text-2xl">
            {selected.item.name}
          </h2>

          <p className="mt-2 text-sm font-semibold text-slate-600">
            基準数量：{selected.expectedQuantity}
            {unit}
          </p>
          {alreadyRecorded && <p className="mt-2 text-sm font-bold text-emerald-700">前回入力：{selected.countedQuantity}{unit}（再保存すると上書きされます）</p>}
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
        >
          戻る
        </button>
      </div>

      <button
        type="button"
        aria-expanded={detailsOpen}
        onClick={() => setDetailsOpen((current) => !current)}
        className="mt-5 w-full rounded-2xl bg-slate-100 px-4 py-3 font-black text-blue-700 transition hover:bg-blue-50"
      >
        {detailsOpen ? "商品詳細を閉じる" : "商品詳細を見る"}
      </button>

      {detailsOpen && (
        <dl className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <Detail label="JANコード" value={selected.item.janCode} />
          <Detail
            label="システムバーコード"
            value={selected.item.systemBarcode}
          />
          <Detail label="管理コード" value={selected.item.managementCode} />
          <Detail
            label="管理グループコード"
            value={selected.item.managementGroupCode}
          />
          <Detail label="メーカー" value={selected.item.manufacturer} />
          <Detail label="分類" value={category} />
          <Detail label="保管場所" value={selected.storageLocation?.name} />
          <Detail label="ロット番号" value={selected.lotNo} />
          <Detail label="使用期限" value={selected.expirationDate} />
          <Detail label="単位" value={unit} />
        </dl>
      )}

      <p className="mt-3 text-sm font-bold text-slate-600">保管場所：{selected.storageLocation?.name || "未設定"} ／ ロット：{selected.lotNo || "なし"}</p>
      <label className="mt-5 block">
        <span className="font-black text-slate-900">棚卸数量</span>

        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          autoComplete="off"
          aria-invalid={quantity.trim() !== "" && !isValidQuantity}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault();
              if (!disabled && !saving && isValidQuantity) onSave();
            }
          }}
          disabled={disabled || saving}
          value={quantity}
          onChange={(event) => onQuantityChange(event.target.value)}
          onFocus={(event) => event.target.select()}
          onBlur={() => onQuantityChange(quantity.normalize("NFKC"))}
          onCompositionEnd={(event) => onQuantityChange(event.currentTarget.value.normalize("NFKC"))}
          className="mt-2 min-h-16 w-full rounded-2xl border-2 border-blue-500 px-4 py-3 text-3xl font-black text-slate-950 outline-none transition focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
        />
      </label>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" disabled={disabled || saving || !isValidQuantity || countedQuantity === 0} onClick={() => onQuantityChange(stepStocktakeQuantity(quantity, -1))} className="min-h-12 rounded-xl bg-slate-100 text-xl font-black disabled:opacity-40" aria-label="数量を1減らす">−1</button>
        <button type="button" disabled={disabled || saving} onClick={() => onQuantityChange("0")} className="min-h-12 rounded-xl bg-slate-100 font-black disabled:opacity-40">0にする</button>
        <button type="button" disabled={disabled || saving || !isValidQuantity || countedQuantity === Number.MAX_SAFE_INTEGER} onClick={() => onQuantityChange(stepStocktakeQuantity(quantity, 1))} className="min-h-12 rounded-xl bg-slate-100 text-xl font-black disabled:opacity-40" aria-label="数量を1増やす">＋1</button>
      </div>
      <p className="mt-2 text-sm text-slate-500">単位：{unit}。実際に数えた数量を入力してください。</p>
      {quantity.trim() !== "" && !isValidQuantity && <p role="alert" className="mt-2 font-bold text-red-700">0以上の整数を入力してください。</p>}
      <details className="mt-4" open={memo ? true : undefined}>
        <summary className="cursor-pointer py-2 font-bold text-slate-600">メモ（任意）</summary>
        <label className="block"><span className="sr-only">棚卸メモ</span><textarea rows={2} value={memo} onChange={(event) => onMemoChange(event.target.value)} disabled={disabled || saving} placeholder="破損や保管場所の違いなど" className="mt-2 w-full rounded-xl border p-3" /></label>
      </details>

      <div
        className={`mt-4 rounded-2xl px-4 py-4 text-center text-lg font-black ${differenceStyle}`}
      >
        差異：
        {difference === null
          ? "-"
          : `${difference > 0 ? "+" : ""}${difference}${unit}`}
      </div>

      <button
        type="button"
        disabled={disabled || saving || !isValidQuantity}
        onClick={onSave}
        className="mt-5 min-h-14 w-full rounded-2xl bg-blue-600 px-4 py-4 text-base font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:text-lg"
      >
        {saving
          ? "保存中..."
          : continuous
            ? "保存して次を読み取る"
            : "棚卸を保存する"}
      </button>

      {continuous && (
        <p className="mt-3 text-center text-xs font-medium text-slate-500">
          保存後は数量入力をクリアし、次の商品をそのまま読み取れます。
        </p>
      )}
    </section>
  );
}
