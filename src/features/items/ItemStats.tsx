import type { Item } from "./types";

type Props = {
  items: Item[];
  filteredItems: Item[];
  loading: boolean;
};

export default function ItemStats({
  items,
  filteredItems,
  loading,
}: Props) {
  const janCount = items.filter(
    (item) => item.janCode
  ).length;

  const noJanCount = items.length - janCount;

  const rate =
    items.length === 0
      ? 0
      : Math.round((janCount / items.length) * 100);

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl bg-white p-6 shadow">
        <p className="text-sm text-gray-500">
          商品数
        </p>

        <h2 className="mt-2 text-4xl font-bold">
          {items.length}
        </h2>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <p className="text-sm text-gray-500">
          検索結果
        </p>

        <h2 className="mt-2 text-4xl font-bold">
          {filteredItems.length}
        </h2>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <p className="text-sm text-gray-500">
          JAN登録率
        </p>

        <h2 className="mt-2 text-4xl font-bold">
          {rate}%
        </h2>

        <p className="mt-2 text-sm text-gray-500">
          登録済 {janCount}件 /
          未登録 {noJanCount}件
        </p>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <p className="text-sm text-gray-500">
          状態
        </p>

        <h2 className="mt-2 text-2xl font-bold">
          {loading
            ? "Loading..."
            : "Ready"}
        </h2>
      </div>
    </div>
  );
}