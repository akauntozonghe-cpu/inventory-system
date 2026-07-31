type Props = {
  item: {
    id: string;
    name: string;
    janCode: string | null;
    quantity: number;
  };
  quantity: number;
  saving: boolean;
  onQuantityChange: React.Dispatch<React.SetStateAction<number>>;
  onSave: () => void | Promise<void>;
};

export default function ProductCard({
  item,
  quantity,
  saving,
  onQuantityChange,
  onSave,
}: Props) {
  return (
    <div className="border rounded-xl p-6 shadow bg-white space-y-4">
      <h2 className="text-xl font-bold">📦 商品情報</h2>

      <p>
        <span className="font-semibold">商品名：</span>
        {item.name}
      </p>

      <p>
        <span className="font-semibold">JANコード：</span>
        {item.janCode ?? "未登録"}
      </p>

      <p>
        <span className="font-semibold">現在在庫：</span>
        {item.quantity}
      </p>

      <div>
        <label className="block mb-2 font-semibold">
          棚卸数量
        </label>

        <input
          type="number"
          min={0}
          value={quantity}
          onChange={(e) => onQuantityChange(Number(e.target.value))}
          className="border rounded-lg p-2 w-full"
        />
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="w-full bg-green-600 text-white rounded-lg py-3 disabled:bg-gray-400"
      >
        {saving ? "保存中..." : "保存"}
      </button>
    </div>
  );
}