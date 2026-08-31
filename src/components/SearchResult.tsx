"use client";

export type SearchItem = {
  id: string;

  quantity: number;
  actualQuantity: number;

  lotNo: string | null;
  expirationDate: string | null;

  storageLocation: {
    id: string;
    name: string;
  } | null;

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
  items: SearchItem[];
  onSelect: (item: SearchItem) => void;
};

export default function SearchResult({
  items,
  onSelect,
}: Props) {

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">

      <div className="px-6 py-4 border-b bg-gray-50 font-bold">
        検索結果 ({items.length}件)
      </div>

      <div className="divide-y">

        {items.map((inventory) => (

          <button
            key={inventory.id}
            onClick={() => onSelect(inventory)}
            className="w-full text-left p-5 hover:bg-blue-50 transition"
          >

            <div className="flex justify-between">

              <div>

                <div className="text-xl font-bold">
                  {inventory.item.name}
                </div>

                <div className="text-sm text-gray-500 mt-2">

                  JAN：
                  {inventory.item.janCode ?? "-"}

                </div>

                <div className="text-sm text-gray-500">

                  管理コード：
                  {inventory.item.managementCode ?? "-"}

                </div>

              </div>

              <div className="text-right">

                <div className="font-semibold">

                  在庫
                  {" "}
                  {inventory.quantity}
                  {" "}
                  {inventory.item.defaultUnit ?? "個"}

                </div>

              </div>

            </div>

            <div className="grid grid-cols-3 gap-4 mt-4 text-sm">

              <div>

                <div className="text-gray-500">
                  ロット
                </div>

                <div>
                  {inventory.lotNo ?? "-"}
                </div>

              </div>

              <div>

                <div className="text-gray-500">
                  使用期限
                </div>

                <div>

                  {inventory.expirationDate
                    ? /^\d{4}-\d{2}$/.test(inventory.expirationDate)
                      ? `${inventory.expirationDate.slice(0, 4)}年${Number(inventory.expirationDate.slice(5, 7))}月`
                      : new Date(
                        inventory.expirationDate
                      ).toLocaleDateString("ja-JP")
                    : "-"}

                </div>

              </div>

              <div>

                <div className="text-gray-500">
                  保管場所
                </div>

                <div>

                  {inventory.storageLocation?.name ??
                    "-"}

                </div>

              </div>

            </div>

          </button>

        ))}

      </div>

    </div>
  );

}
