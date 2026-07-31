type Props = {
  barcode: string;
  searching: boolean;
  onBarcodeChange: (value: string) => void;
  onSearch: () => void;
};

export default function BarcodeSearch({
  barcode,
  searching,
  onBarcodeChange,
  onSearch,
}: Props) {
  return (
    <div className="border rounded-xl p-6 shadow bg-white">
      <h2 className="text-xl font-bold mb-4">
        📷 バーコード検索
      </h2>

      <input
        className="border rounded w-full p-2"
        placeholder="JANコードを入力"
        value={barcode}
        onChange={(e) => onBarcodeChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSearch();
          }
        }}
      />

      <button
        className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white rounded py-3 disabled:opacity-50"
        onClick={onSearch}
        disabled={searching}
      >
        {searching ? "検索中..." : "🔍 商品検索"}
      </button>
    </div>
  );
}