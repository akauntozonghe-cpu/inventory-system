"use client";

type Item = {
  id: string;
  managementCode: string | null;
  managementGroupCode: string | null;
  janCode: string | null;
  name: string;
  manufacturer: string | null;
  majorCategory: string | null;
  minorCategory: string | null;
  defaultUnit: string | null;
};

type Props = {
  item: Item;
  onEdit?: () => void;
};

export default function ItemInfoCard({
  item,
  onEdit,
}: Props) {
  return (
    <div className="bg-white rounded-xl shadow p-6">

      <div className="flex items-center justify-between mb-6">

        <h2 className="text-xl font-bold">
          商品情報
        </h2>

        <button
          onClick={onEdit}
          className="rounded-lg bg-amber-500 text-white px-4 py-2 hover:bg-amber-600"
        >
          編集
        </button>

      </div>

      <div className="grid gap-4">

        <InfoRow
          label="商品名"
          value={item.name}
        />

        <InfoRow
          label="JANコード"
          value={item.janCode}
        />

        <InfoRow
          label="管理コード"
          value={item.managementCode}
        />

        <InfoRow
          label="管理グループ"
          value={item.managementGroupCode}
        />

        <InfoRow
          label="メーカー"
          value={item.manufacturer}
        />

        <InfoRow
          label="大分類"
          value={item.majorCategory}
        />

        <InfoRow
          label="小分類"
          value={item.minorCategory}
        />

        <InfoRow
          label="単位"
          value={item.defaultUnit ?? "個"}
        />

      </div>

    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="border-b pb-3">

      <p className="text-sm text-gray-500">
        {label}
      </p>

      <p className="mt-1 font-medium">
        {value || "-"}
      </p>

    </div>
  );
}