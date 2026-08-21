"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type InventoryInstance = {
  id: string;
  quantity: number;
  actualQuantity: number | null;
  lotNo: string | null;
  expirationDate: string | null;
  unit: string | null;
  stocktakeStatus: string;
  updatedAt: string;

  storageLocation: {
    name: string;
  } | null;
};

type Item = {
  id: string;
  managementCode: string | null;
  managementGroupCode: string | null;
  janCode: string | null;
  name: string;
  manufacturer: string | null;
  majorCategory: string | null;
  minorCategory: string | null;
  defaultUnit: string | null;

  inventoryInstances: InventoryInstance[];
};

export default function ItemPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id as string;

  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadItem() {
    try {
      setLoading(true);

      const res = await fetch(`/api/items/${id}`);

      if (!res.ok) {
        throw new Error();
      }

      const data = await res.json();

      setItem(data);
    } catch {
      setError("商品の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) {
      loadItem();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-8">
        <div className="text-center py-20 text-gray-500">
          読み込み中...
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="max-w-5xl mx-auto p-8">
        <div className="rounded-xl border border-red-300 bg-red-50 p-6 text-red-600">
          {error || "商品が見つかりません"}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-8">

      <div className="flex justify-between items-start mb-8">

        <div>
          <h1 className="text-3xl font-bold">
            {item.name}
          </h1>

          <div className="text-gray-500 mt-2">
            商品詳細
          </div>
        </div>

        <button
          onClick={() => router.back()}
          className="rounded-lg border px-4 py-2 hover:bg-gray-100"
        >
          戻る
        </button>

      </div>

      <div className="rounded-xl border bg-white shadow p-6">

        <h2 className="text-xl font-bold mb-4">
          商品情報
        </h2>

        <div className="grid md:grid-cols-2 gap-6">

          <div>
            <div className="text-sm text-gray-500">
              管理番号
            </div>
            <div>
              {item.managementCode ?? "-"}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">
              管理グループ
            </div>
            <div>
              {item.managementGroupCode ?? "-"}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">
              JAN
            </div>
            <div>
              {item.janCode ?? "-"}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">
              メーカー
            </div>
            <div>
              {item.manufacturer ?? "-"}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">
              大分類
            </div>
            <div>
              {item.majorCategory ?? "-"}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">
              小分類
            </div>
            <div>
              {item.minorCategory ?? "-"}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">
              標準単位
            </div>
            <div>
              {item.defaultUnit ?? "個"}
            </div>
          </div>

        </div>

      </div>

      <div className="rounded-xl border bg-white shadow p-6 mt-8">

        <h2 className="text-xl font-bold mb-4">
          在庫一覧
        </h2>

        {item.inventoryInstances.length === 0 ? (

          <div className="text-gray-500">
            在庫情報はありません。
          </div>

        ) : (

          <div className="space-y-4">

            {item.inventoryInstances.map((inventory) => (

              <div
                key={inventory.id}
                className="rounded-lg border p-5"
              >

                <div className="flex justify-between items-start">

                  <div>

                    <div className="font-bold text-lg">
                      {inventory.storageLocation?.name ?? "保管場所未設定"}
                    </div>

                    <div className="text-gray-500 mt-1">
                      LOT：{inventory.lotNo ?? "-"}
                    </div>

                    <div className="text-gray-500">
                      使用期限：{inventory.expirationDate ?? "-"}
                    </div>

                    <div className="text-gray-500">
                      最終更新：
                      {new Date(inventory.updatedAt).toLocaleString("ja-JP")}
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-3xl font-bold text-blue-600">
                      {inventory.quantity}
                    </div>

                    <div>
                      {inventory.unit ?? item.defaultUnit ?? "個"}
                    </div>

                    <span
                      className={`inline-block mt-3 rounded-full px-3 py-1 text-sm font-bold ${
                        inventory.stocktakeStatus === "棚卸済"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {inventory.stocktakeStatus}
                    </span>

                  </div>

                </div>

                <div className="flex gap-3 mt-6">

                  <button
                    className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    onClick={() =>
                      router.push(`/stocktake?inventory=${inventory.id}`)
                    }
                  >
                    📷 棚卸する
                  </button>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

      <div className="flex gap-3 mt-8">

        <button
          className="rounded-lg border px-5 py-3 hover:bg-gray-100"
          onClick={() => router.push(`/items/${item.id}/edit`)}
        >
          ✏ 編集
        </button>

        <button
          className="rounded-lg border border-red-500 px-5 py-3 text-red-600 hover:bg-red-50"
          onClick={async () => {
  const ok = confirm(
    `「${item.name}」を削除しますか？`
  );

  if (!ok) return;

  try {
    const res = await fetch(`/api/items/${item.id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      throw new Error();
    }

    alert("削除しました");

    router.push("/items");
  } catch {
    alert("削除に失敗しました");
  }
}}
        >
          🗑 削除
        </button>

      </div>

    </div>
  );
}