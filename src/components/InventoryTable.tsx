"use client";

type Inventory = {
  id: string;
  quantity: number;
  actualQuantity: number | null;
  allocationType: string;
  status: string;
  lotNo: string | null;
  expirationDate: string | null;
  updatedAt: string;

  storageLocation: {
    id: string;
    name: string;
  } | null;
};

type Props = {
  inventories: Inventory[];
  unit?: string | null;
  onEdit?: (inventory: Inventory) => void;
  onDelete?: (id: string) => void;
};

export default function InventoryTable({
  inventories,
  unit,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div className="bg-white rounded-xl shadow">

      <div className="flex items-center justify-between p-6 border-b">

        <h2 className="text-xl font-bold">
          在庫一覧
        </h2>

        <span className="text-sm text-gray-500">
          {inventories.length}件
        </span>

      </div>

      <div className="overflow-auto">

        <table className="w-full">

          <thead className="bg-slate-100">

            <tr>

              <th className="text-left p-4">
                保管場所
              </th>

              <th className="text-center p-4">
                区分
              </th>

              <th className="text-center p-4">
                数量
              </th>

              <th className="text-center p-4">
                実棚
              </th>

              <th className="text-center p-4">
                ロット
              </th>

              <th className="text-center p-4">
                使用期限
              </th>

              <th className="text-center p-4">
                最終更新
              </th>

              <th className="text-center p-4">
                操作
              </th>

            </tr>

          </thead>

          <tbody>

            {inventories.length === 0 && (

              <tr>

                <td
                  colSpan={8}
                  className="text-center p-10 text-gray-500"
                >
                  在庫はありません
                </td>

              </tr>

            )}

            {inventories.map((inventory) => (

              <tr
                key={inventory.id}
                className="border-t hover:bg-slate-50"
              >

                <td className="p-4">
                  {inventory.storageLocation?.name ?? "-"}
                </td>

                <td className="text-center p-4">
                  {inventory.allocationType}
                </td>

                <td className="text-center p-4 font-bold">
                  {inventory.quantity}
                  {unit}
                </td>

                <td className="text-center p-4">
                  {inventory.actualQuantity ?? "-"}
                </td>

                <td className="text-center p-4">
                  {inventory.lotNo ?? "-"}
                </td>

                <td className="text-center p-4">
                  {inventory.expirationDate ?? "-"}
                </td>

                <td className="text-center p-4">
                  {new Date(
                    inventory.updatedAt
                  ).toLocaleString("ja-JP")}
                </td>

                <td className="text-center p-4">

                  <div className="flex justify-center gap-2">

                    <button
                      onClick={() =>
                        onEdit?.(inventory)
                      }
                      className="rounded-lg bg-amber-500 px-3 py-2 text-white hover:bg-amber-600"
                    >
                      編集
                    </button>

                    <button
                      onClick={() => {

                        if (
                          confirm(
                            "この在庫を削除しますか？"
                          )
                        ) {

                          onDelete?.(
                            inventory.id
                          );

                        }

                      }}
                      className="rounded-lg bg-red-600 px-3 py-2 text-white hover:bg-red-700"
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

    </div>
  );
}