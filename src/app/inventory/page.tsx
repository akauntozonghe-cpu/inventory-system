"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
};

type Inventory = {
  id: string;

  quantity: number;

  location: string | null;

  allocationType: string;

  item: Item;
};

export default function InventoryPage() {
  const [items, setItems] =
    useState<Item[]>([]);

  const [inventory, setInventory] =
    useState<Inventory[]>([]);

  const [selectedItem, setSelectedItem] =
    useState("");

  const [quantity, setQuantity] =
    useState(1);

  const [location, setLocation] =
    useState("");

  const [search, setSearch] =
    useState("");

  const fetchItems = async () => {
    const res = await fetch("/api/items");

    const data = await res.json();

    setItems(data);
  };

  const fetchInventory = async () => {
    const res =
      await fetch("/api/inventory");

    const data = await res.json();

    setInventory(data);
  };

  useEffect(() => {
    fetchItems();

    fetchInventory();
  }, []);

  const createInventory = async () => {
    await fetch("/api/inventory", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        itemId: selectedItem,

        quantity,

        allocationType: "home",

        location,
      }),
    });

    setQuantity(1);

    setLocation("");

    fetchInventory();
  };

  const updateInventory = async (
    id: string,
    quantity: number,
    location: string,
    allocationType: string
  ) => {
    await fetch("/api/inventory", {
      method: "PATCH",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        id,

        quantity,

        location,

        allocationType,
      }),
    });

    fetchInventory();
  };

  const deleteInventory = async (
    id: string
  ) => {
    await fetch("/api/inventory", {
      method: "DELETE",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        id,
      }),
    });

    fetchInventory();
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">
        在庫管理
      </h1>

      <input
        type="text"
        placeholder="検索"
        value={search}
        onChange={(e) =>
          setSearch(e.target.value)
        }
        className="border p-2 rounded mb-6 w-full max-w-md"
      />

      <div className="flex flex-col gap-4 max-w-md mb-10">
        <select
          value={selectedItem}
          onChange={(e) =>
            setSelectedItem(
              e.target.value
            )
          }
          className="border p-2 rounded"
        >
          <option value="">
            商品選択
          </option>

          {items.map((item) => (
            <option
              key={item.id}
              value={item.id}
            >
              {item.name}
            </option>
          ))}
        </select>

        <input
          type="number"
          value={quantity}
          onChange={(e) =>
            setQuantity(
              Number(e.target.value)
            )
          }
          className="border p-2 rounded"
        />

        <input
          type="text"
          placeholder="保管場所"
          value={location}
          onChange={(e) =>
            setLocation(
              e.target.value
            )
          }
          className="border p-2 rounded"
        />

        <button
          onClick={createInventory}
          className="bg-black text-white p-2 rounded"
        >
          在庫登録
        </button>
      </div>

      <div className="border rounded overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-3 border-b">
                商品
              </th>

              <th className="text-left p-3 border-b">
                数量
              </th>

              <th className="text-left p-3 border-b">
                所属
              </th>

              <th className="text-left p-3 border-b">
                保管場所
              </th>

              <th className="text-left p-3 border-b">
                操作
              </th>
            </tr>
          </thead>

          <tbody>
            {inventory
              .filter((inv) => {
                const keyword =
                  search.toLowerCase();

                return (
                  inv.item.name
                    .toLowerCase()
                    .includes(
                      keyword
                    ) ||

                  (
                    inv.location ?? ""
                  )
                    .toLowerCase()
                    .includes(
                      keyword
                    )
                );
              })

              .map((inv) => (
                <tr key={inv.id}>
                  <td className="p-3 border-b">
                    {inv.item.name}
                  </td>

                  <td className="p-3 border-b">
                    <input
                      type="number"
                      value={inv.quantity}
                      onChange={(e) => {
                        const value =
                          Number(
                            e.target.value
                          );

                        setInventory(
                          (prev) =>
                            prev.map(
                              (
                                item
                              ) =>
                                item.id ===
                                inv.id
                                  ? {
                                      ...item,
                                      quantity:
                                        value,
                                    }
                                  : item
                            )
                        );
                      }}
                      className="border p-1 rounded w-24"
                    />
                  </td>

                  <td className="p-3 border-b">
                    <select
                      value={
                        inv.allocationType
                      }
                      onChange={(e) => {
                        const value =
                          e.target
                            .value;

                        setInventory(
                          (prev) =>
                            prev.map(
                              (
                                item
                              ) =>
                                item.id ===
                                inv.id
                                  ? {
                                      ...item,
                                      allocationType:
                                        value,
                                    }
                                  : item
                            )
                        );
                      }}
                      className="border p-1 rounded"
                    >
                      <option value="home">
                        home
                      </option>

                      <option value="mercari">
                        mercari
                      </option>

                      <option value="yahoo">
                        yahoo
                      </option>

                      <option value="warehouse">
                        warehouse
                      </option>

                      <option value="sold">
                        sold
                      </option>

                      <option value="disposed">
                        disposed
                      </option>
                    </select>
                  </td>

                  <td className="p-3 border-b">
                    <input
                      type="text"
                      value={
                        inv.location ??
                        ""
                      }
                      onChange={(e) => {
                        const value =
                          e.target
                            .value;

                        setInventory(
                          (prev) =>
                            prev.map(
                              (
                                item
                              ) =>
                                item.id ===
                                inv.id
                                  ? {
                                      ...item,
                                      location:
                                        value,
                                    }
                                  : item
                            )
                        );
                      }}
                      className="border p-1 rounded"
                    />
                  </td>

                  <td className="p-3 border-b flex gap-2">
                    <button
                      onClick={() =>
                        updateInventory(
                          inv.id,
                          inv.quantity,
                          inv.location ??
                            "",
                          inv.allocationType
                        )
                      }
                      className="bg-blue-500 text-white px-3 py-1 rounded"
                    >
                      保存
                    </button>

                    <button
                      onClick={() =>
                        deleteInventory(
                          inv.id
                        )
                      }
                      className="bg-red-500 text-white px-3 py-1 rounded"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}