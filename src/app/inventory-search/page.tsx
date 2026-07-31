"use client";

import { useEffect, useState } from "react";

type Inventory = {
  id: string;
  quantity: number;
  lotNo: string | null;
  expirationDate: string |null;
  updatedAt: string;

  item: {
    name: string;
    janCode: string | null;
    managementCode: string | null;
    defaultUnit: string | null;
  };

  storageLocation: {
    name: string;
  } | null;
};

export default function InventorySearchPage() {

  const [keyword, setKeyword] = useState("");

  const [items, setItems] = useState<Inventory[]>([]);

  async function search(value: string) {

    setKeyword(value);

    if (!value.trim()) {

      setItems([]);

      return;

    }

    const res = await fetch(
      `/api/inventory/search?q=${encodeURIComponent(value)}`
    );

    if (!res.ok) {

      setItems([]);

      return;

    }

    const data = await res.json();

    setItems(data);

  }

  useEffect(() => {

    if (!keyword) return;

    search(keyword);

  }, []);

  return (

    <div className="max-w-5xl mx-auto p-8">

      <h1 className="text-3xl font-bold mb-6">
        在庫検索
      </h1>

      <input
        type="text"
        value={keyword}
        onChange={(e)=>search(e.target.value)}
        placeholder="バーコード・JAN・商品名・管理番号"
        className="w-full rounded-xl border p-4 text-xl mb-8"
      />

      <div className="space-y-4">

        {items.length===0 && keyword && (

          <div className="text-gray-500 text-center py-10">

            該当する在庫はありません

          </div>

        )}

        {items.map((inventory)=>(

          <div
            key={inventory.id}
            className="rounded-xl border bg-white shadow p-6"
          >

            <div className="flex justify-between">

              <div>

                <div className="text-2xl font-bold">

                  {inventory.item.name}

                </div>

                <div className="text-gray-500 mt-2">

                  JAN：
                  {inventory.item.janCode ?? "-"}

                </div>

                <div className="text-gray-500">

                  管理番号：
                  {inventory.item.managementCode ?? "-"}

                </div>

              </div>

              <div className="text-right">

                <div className="text-3xl font-bold text-blue-600">

                  {inventory.quantity}

                </div>

                <div>

                  {inventory.item.defaultUnit ?? "個"}

                </div>

              </div>

            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">

              <div>

                <div className="text-gray-500 text-sm">

                  保管場所

                </div>

                <div>

                  {inventory.storageLocation?.name ?? "-"}

                </div>

              </div>

              <div>

                <div className="text-gray-500 text-sm">

                  ロット

                </div>

                <div>

                  {inventory.lotNo ?? "-"}

                </div>

              </div>

              <div>

                <div className="text-gray-500 text-sm">

                  使用期限

                </div>

                <div>

                  {inventory.expirationDate ?? "-"}

                </div>

              </div>

              <div>

                <div className="text-gray-500 text-sm">

                  最終更新

                </div>

                <div>

                  {new Date(
                    inventory.updatedAt
                  ).toLocaleString("ja-JP")}

                </div>

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}