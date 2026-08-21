"use client";

import type { Item } from "./types";

type Props = {
  items: Item[];
  reload: () => void;
  onEdit: (item: Item) => void;
};

export default function ItemTable({
  items,
  reload,
  onEdit,
}: Props) {
  async function deleteItem(
    id: string,
    name: string
  ) {
    if (!confirm(`「${name}」を削除しますか？`)) {
      return;
    }

    try {
      const res = await fetch(`/api/items?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("削除に失敗しました。");
      }

      reload();
    } catch (error) {
      console.error(error);
      alert("削除に失敗しました。");
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <p className="text-gray-500">
          商品がありません。
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow">
      <table className="w-full">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-4 text-left">
              商品名
            </th>

            <th className="p-4 text-left">
              JANコード
            </th>

            <th className="p-4 text-center">
              操作
            </th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-t hover:bg-slate-50 transition"
            >
              <td className="p-4 font-medium">
                {item.name}
              </td>

              <td className="p-4 font-mono">
                {item.janCode || "-"}
              </td>

              <td className="p-4">
                <div className="flex justify-center gap-2 flex-wrap">
                  <button
                    onClick={() =>
                      (location.href = `/items/${item.id}`)
                    }
                    className="rounded-lg bg-sky-600 px-4 py-2 text-white hover:bg-sky-700"
                  >
                    詳細
                  </button>

                  <button
                    onClick={() => onEdit(item)}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-white hover:bg-amber-600"
                  >
                    編集
                  </button>

                  <button
                    onClick={() =>
                      deleteItem(item.id, item.name)
                    }
                    className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                  >
                    削除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}