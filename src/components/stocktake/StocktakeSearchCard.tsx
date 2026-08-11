"use client";

export type StocktakeSearchItem = {
  id: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  isRecorded: boolean;
  lotNo: string | null;
  expirationDate: string | null;
  unit: string | null;
  item: {
    name: string;
    janCode: string | null;
    systemBarcode: string | null;
    managementCode: string | null;
    managementGroupCode: string | null;
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
  item: StocktakeSearchItem;
  expanded: boolean;
  disabled: boolean;
  onToggle: () => void;
  onSelect: () => void;
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

export default function StocktakeSearchCard({
  item,
  expanded,
  disabled,
  onToggle,
  onSelect,
}: Props) {
  const unit = item.unit ?? item.item.defaultUnit ?? "";
  const difference =
    item.countedQuantity === null
      ? null
      : item.countedQuantity - item.expectedQuantity;

  const badge = !item.isRecorded
    ? {
        label: "未棚卸",
        className: "bg-amber-100 text-amber-700",
      }
    : difference === 0
      ? {
          label: "一致",
          className: "bg-emerald-100 text-emerald-700",
        }
      : {
          label: "差異あり",
          className: "bg-red-100 text-red-700",
        };

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-sm">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-black text-slate-950 sm:text-xl">
              {item.item.name}
            </h2>

            <p className="mt-2 break-all text-sm text-slate-600">
              JAN：{item.item.janCode ?? "-"}
            </p>

            <p className="mt-1 text-sm text-slate-600">
              保管場所：{item.storageLocation?.name ?? "未設定"}
            </p>

            <p className="mt-3 text-base font-black text-blue-600">
              現在庫：{item.expectedQuantity}
              {unit}
            </p>
          </div>

          <span
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>

        {item.isRecorded && (
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3">
            <div>
              <p className="text-xs font-bold text-slate-500">棚卸数量</p>
              <p className="mt-1 font-black text-slate-900">
                {item.countedQuantity}
                {unit}
              </p>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-500">差異</p>
              <p
                className={`mt-1 font-black ${
                  difference === 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {difference === null
                  ? "-"
                  : `${difference > 0 ? "+" : ""}${difference}${unit}`}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="min-h-12 rounded-xl bg-slate-100 px-3 py-3 text-sm font-bold text-slate-700"
          >
            {expanded ? "詳細を閉じる" : "詳細を表示"}
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={onSelect}
            className="min-h-12 rounded-xl bg-blue-600 px-3 py-3 text-sm font-black text-white disabled:bg-slate-300"
          >
            棚卸入力
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50 p-4 sm:p-5">
          <dl className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <Detail label="JANコード" value={item.item.janCode} />
            <Detail label="システムバーコード" value={item.item.systemBarcode} />
            <Detail label="管理コード" value={item.item.managementCode} />
            <Detail
              label="管理グループコード"
              value={item.item.managementGroupCode}
            />
            <Detail label="メーカー" value={item.item.manufacturer} />
            <Detail
              label="分類"
              value={[item.item.majorCategory, item.item.minorCategory]
                .filter(Boolean)
                .join(" / ")}
            />
            <Detail label="保管場所" value={item.storageLocation?.name} />
            <Detail label="ロット番号" value={item.lotNo} />
            <Detail label="使用期限" value={item.expirationDate} />
            <Detail label="単位" value={unit} />
          </dl>
        </div>
      )}
    </article>
  );
}