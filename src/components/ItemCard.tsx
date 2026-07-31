"use client";

import QuantityInput from "./QuantityInput";

type StorageLocation = {
  id: string;
  name: string;
};

type InventoryItem = {
  id: string;

  quantity: number;
  actualQuantity: number;

  lotNo: string | null;
  expirationDate: string | null;

  storageLocation: StorageLocation | null;

  item: {
    id: string;
    name: string;
    janCode: string | null;
    managementCode: string | null;
    manufacturer: string | null;
    majorCategory: string | null;
    minorCategory: string | null;
    defaultUnit: string | null;
  };
};

type Props = {
  item: InventoryItem | null;

  quantity: number;
  onQuantityChange: (value: number) => void;

  storageLocations: StorageLocation[];
  storageLocationId: string;
  onLocationChange: (value: string) => void;

  saving: boolean;
  onSave: () => void;
};

export default function ItemCard({
  item,
  quantity,
  onQuantityChange,
  storageLocations,
  storageLocationId,
  onLocationChange,
  saving,
  onSave,
}: Props) {

  if (!item) {
    return (
      <div className="rounded-xl bg-white shadow p-10 text-center text-gray-500">
        バーコードを読み取るか商品を検索してください
      </div>
    );
  }

  const difference = quantity - item.quantity;

  return (
    <div className="rounded-xl bg-white shadow-lg p-8 space-y-8">

      <div className="border-b pb-4">
        <h2 className="text-3xl font-bold">
          {item.item.name}
        </h2>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">

          <div>
            <div className="text-gray-500">JANコード</div>
            <div>{item.item.janCode ?? "-"}</div>
          </div>

          <div>
            <div className="text-gray-500">管理コード</div>
            <div>{item.item.managementCode ?? "-"}</div>
          </div>

          <div>
            <div className="text-gray-500">メーカー</div>
            <div>{item.item.manufacturer ?? "-"}</div>
          </div>

          <div>
            <div className="text-gray-500">分類</div>
            <div>
              {item.item.majorCategory ?? "-"}
              {" / "}
              {item.item.minorCategory ?? "-"}
            </div>
          </div>

        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">

        <div className="rounded-lg bg-gray-50 p-4">
          <div className="text-gray-500 text-sm">
            ロット番号
          </div>

          <div className="text-xl font-semibold">
            {item.lotNo ?? "-"}
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 p-4">
          <div className="text-gray-500 text-sm">
            使用期限
          </div>

          <div className="text-xl font-semibold">
            {item.expirationDate
              ? new Date(item.expirationDate).toLocaleDateString("ja-JP")
              : "-"}
          </div>
        </div>

      </div>

      <div>

        <label className="font-semibold block mb-2">
          保管場所
        </label>

        <select
          value={storageLocationId}
          onChange={(e) =>
            onLocationChange(e.target.value)
          }
          className="border rounded-lg p-3 w-full"
        >
          {storageLocations.map((location) => (
            <option
              key={location.id}
              value={location.id}
            >
              {location.name}
            </option>
          ))}
        </select>

      </div>

      <div className="rounded-lg border p-5">

        <div className="flex justify-between text-lg">

          <span>理論在庫</span>

          <span className="font-bold">
            {item.quantity} {item.item.defaultUnit ?? "個"}
          </span>

        </div>

      </div>

      <QuantityInput
  value={quantity}
  onChange={onQuantityChange}
  unit={item.item.defaultUnit}
  autoFocus
  onEnter={onSave}
/>

      <div
        className={`rounded-lg p-4 text-center font-bold text-lg ${
          difference === 0
            ? "bg-green-100 text-green-700"
            : difference > 0
            ? "bg-red-100 text-red-700"
            : "bg-yellow-100 text-yellow-700"
        }`}
      >
        差異：
        {difference > 0 ? "+" : ""}
        {difference}
        {" "}
        {item.item.defaultUnit ?? "個"}
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="w-full rounded-xl bg-blue-600 py-4 text-xl text-white hover:bg-blue-700 disabled:bg-gray-400"
      >
        {saving ? "保存中..." : "💾 棚卸保存"}
      </button>

    </div>
  );
}