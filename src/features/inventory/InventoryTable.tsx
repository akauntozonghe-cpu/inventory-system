"use client";

import type { Inventory } from "./types";

type Props = {
  inventories: Inventory[];
  onSave: (inventory: Inventory) => void;
  onDelete: (id: string) => void;
};

export default function InventoryTable({
  inventories,
  onSave,
  onDelete,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow">
      <table className="min-w-full">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-3 text-left">管理コード</th>
            <th className="p-3 text-left">商品名</th>
            <th className="p-3 text-left">Lot</th>
            <th className="p-3 text-left">期限</th>
            <th className="p-3 text-right">帳簿</th>
            <th className="p-3 text-right">実棚</th>
            <th className="p-3 text-right">差異</th>
            <th className="p-3 text-left">保管場所</th>
            <th className="p-3 text-left">棚卸状態</th>
            <th className="p-3 text-center">操作</th>
          </tr>
        </thead>

        <tbody>
          {inventories.map((inv) => {
            const actual =
              inv.actualQuantity ?? inv.quantity;

            const diff =
              actual - inv.quantity;

            return (
              <tr
                key={inv.id}
                className="border-t"
              >
                <td className="p-3">
                  {inv.item.managementCode ?? "-"}
                </td>

                <td className="p-3 font-medium">
                  {inv.item.name}
                </td>

                <td className="p-3">
                  {inv.lotNo ?? "-"}
                </td>

                <td className="p-3">
                  {inv.expirationDate ?? "-"}
                </td>

                <td className="p-3 text-right">
                  {inv.quantity}
                </td>

                <td className="p-3 text-right">
                  {actual}
                </td>

                <td
                  className={`p-3 text-right font-bold ${
                    diff === 0
                      ? "text-green-600"
                      : diff > 0
                      ? "text-blue-600"
                      : "text-red-600"
                  }`}
                >
                  {diff > 0 ? "+" : ""}
                  {diff}
                </td>

                <td className="p-3">
                  {inv.storageLocation?.name ?? "-"}
                </td>

                <td className="p-3">
                  <span
                    className={`rounded px-2 py-1 text-sm ${
                      inv.stocktakeStatus ===
                      "棚卸済"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {inv.stocktakeStatus}
                  </span>
                </td>

                <td className="p-3">
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => onSave(inv)}
                      className="rounded bg-blue-600 px-3 py-1 text-white"
                    >
                      保存
                    </button>

                    <button
                      onClick={() =>
                        onDelete(inv.id)
                      }
                      className="rounded bg-red-600 px-3 py-1 text-white"
                    >
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}