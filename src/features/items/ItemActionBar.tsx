type Props = {
  onRefresh: () => void;
};

export default function ItemActionBar({
  onRefresh,
}: Props) {
  return (
    <div className="flex flex-wrap gap-3 rounded-xl bg-white p-5 shadow">
      <button
        onClick={() => (location.href = "/import")}
        className="rounded-lg bg-emerald-600 px-5 py-3 text-white transition hover:bg-emerald-700"
      >
        📥 Excel取込
      </button>

      <button
        onClick={() => (location.href = "/scan")}
        className="rounded-lg bg-indigo-600 px-5 py-3 text-white transition hover:bg-indigo-700"
      >
        📷 バーコード検索
      </button>

      <button
        onClick={() => alert("CSV出力は次回実装")}
        className="rounded-lg bg-cyan-600 px-5 py-3 text-white transition hover:bg-cyan-700"
      >
        📤 CSV出力
      </button>

      <button
        onClick={onRefresh}
        className="rounded-lg bg-gray-700 px-5 py-3 text-white transition hover:bg-black"
      >
        🔄 更新
      </button>
    </div>
  );
}