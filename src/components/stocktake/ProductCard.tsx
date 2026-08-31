import { assessExpiry, formatExpirationDate } from "@/lib/expiry-management";

type Props = {
  item: {
    id: string;
    name: string;
    janCode: string | null;

    quantity: number;
    actualQuantity: number | null;

    lotNo: string | null;
    expirationDate: string | null;

    storageLocation: {
      id: string;
      name: string;
    } | null;
  };

  quantity: number;

  saving: boolean;

  onQuantityChange: React.Dispatch<
    React.SetStateAction<number>
  >;

  onIncrease: () => void;

  onDecrease: () => void;

  onSave: () => void | Promise<void>;
};

export default function ProductCard({
  item,
  quantity,
  saving,
  onQuantityChange,
  onIncrease,
  onDecrease,
  onSave,
}: Props) {
  const difference =
    quantity - item.quantity;

  const isExpired = assessExpiry(item.expirationDate).level === "EXPIRED";

  return (
    <div className="space-y-5 rounded-xl border bg-white p-6 shadow">

      <h2 className="text-xl font-bold">
        📦 商品情報
      </h2>

      <div className="grid gap-3 md:grid-cols-2">

        <p>
          <span className="font-semibold">
            商品名：
          </span>
          {item.name}
        </p>

        <p>
          <span className="font-semibold">
            JAN：
          </span>
          {item.janCode ?? "未登録"}
        </p>

        <p>
          <span className="font-semibold">
            帳簿数量：
          </span>
          {item.quantity}
        </p>

        <p>
          <span className="font-semibold">
            保管場所：
          </span>
          {item.storageLocation?.name ?? "-"}
        </p>

        <p>
          <span className="font-semibold">
            Lot：
          </span>
          {item.lotNo ?? "-"}
        </p>

        <p>
          <span className="font-semibold">
            消費期限：
          </span>

          <span
            className={
              isExpired
                ? "font-bold text-red-600"
                : ""
            }
          >
            {formatExpirationDate(item.expirationDate)}
          </span>

        </p>

      </div>

      <hr />

      <div>

        <label className="mb-2 block font-semibold">
          棚卸数量
        </label>

        <div className="flex gap-2">

          <button
            onClick={onDecrease}
            className="rounded-lg bg-gray-200 px-5 py-2 text-xl font-bold hover:bg-gray-300"
          >
            −
          </button>

          <input
            type="number"
            min={0}
            value={quantity}
            onChange={(e) =>
              onQuantityChange(
                Number(e.target.value)
              )
            }
            className="flex-1 rounded-lg border p-2 text-center text-lg"
          />

          <button
            onClick={onIncrease}
            className="rounded-lg bg-gray-200 px-5 py-2 text-xl font-bold hover:bg-gray-300"
          >
            ＋
          </button>

        </div>

      </div>

      <div className="rounded-lg bg-slate-50 p-4">

        <div className="flex items-center justify-between">

          <span className="font-semibold">
            差異
          </span>

          <span
            className={`text-2xl font-bold ${
              difference === 0
                ? "text-green-600"
                : difference > 0
                ? "text-blue-600"
                : "text-red-600"
            }`}
          >
            {difference > 0 ? "+" : ""}
            {difference}
          </span>

        </div>

      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="w-full rounded-lg bg-green-600 py-3 font-bold text-white transition hover:bg-green-700 disabled:bg-gray-400"
      >
        {saving
          ? "保存中..."
          : "💾 棚卸を保存"}
      </button>

    </div>
  );
}
