"use client";

import {
  useEffect,
  useState,
} from "react";

type Inventory = {
  id: string;

  quantity: number;

  managementCode?: string;

  storageLocation?: {
    name: string;
  };

  item: {
    name: string;

    janCode?: string;
  };
};

export default function Home() {
  const [items, setItems] =
    useState<Inventory[]>(
      []
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const fetchInventory =
    async () => {
      try {
        setLoading(true);

        setError("");

        const baseUrl =
          typeof window !==
          "undefined"
            ? window.location
                .origin
            : "";

        const res =
          await fetch(
            `${baseUrl}/api/inventory`,
            {
              cache:
                "no-store",
            }
          );

        if (!res.ok) {
          throw new Error(
            "API Error"
          );
        }

        const data =
          await res.json();

        console.log(
          "inventory",
          data
        );

        if (
          Array.isArray(data)
        ) {
          setItems(data);
        } else {
          setItems([]);
        }
      } catch (err) {
        console.error(err);

        setError(
          "在庫取得失敗"
        );

        setItems([]);
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    fetchInventory();
  }, []);

  const totalQuantity =
    items.reduce(
      (
        total,
        item
      ) =>
        total +
        item.quantity,
      0
    );

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <div className="text-sm text-gray-500">
            在庫管理システム
          </div>

          <div className="text-5xl font-bold">
            在庫一覧
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow p-5">
            <div className="text-sm text-gray-500">
              登録アイテム数
            </div>

            <div className="text-5xl font-bold">
              {items.length}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-5">
            <div className="text-sm text-gray-500">
              総数量
            </div>

            <div className="text-5xl font-bold">
              {totalQuantity}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center">
            <div className="text-2xl font-bold">
              在庫一覧
            </div>

            <button
              onClick={
                fetchInventory
              }
              className="bg-black text-white px-4 py-2 rounded-xl"
            >
              更新
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500 text-xl">
              読み込み中...
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-600 text-xl">
              {error}
            </div>
          ) : items.length ===
            0 ? (
            <div className="p-8 text-center text-gray-500 text-xl">
              データなし
            </div>
          ) : (
            <div className="divide-y">
              {items.map(
                (item) => (
                  <div
                    key={
                      item.id
                    }
                    className="p-5 hover:bg-gray-50 transition"
                  >
                    <div className="flex justify-between gap-4">
                      <div className="flex-1">
                        <div className="text-3xl font-bold break-words">
                          {
                            item
                              .item
                              .name
                          }
                        </div>

                        <div className="mt-3 text-gray-600 break-all">
                          JAN:
                          {" "}
                          {
                            item
                              .item
                              .janCode
                          }
                        </div>

                        <div className="text-gray-600 break-all">
                          管理番号:
                          {" "}
                          {
                            item.managementCode
                          }
                        </div>

                        <div className="text-gray-600">
                          保管場所:
                          {" "}
                          {
                            item
                              .storageLocation
                              ?.name
                          }
                        </div>
                      </div>

                      <div className="text-right min-w-[80px]">
                        <div className="text-sm text-gray-500">
                          数量
                        </div>

                        <div className="text-5xl font-bold">
                          {
                            item.quantity
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}