"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
  janCode: string | null;
};

export default function ItemsPage() {
  const [name, setName] = useState("");
  const [janCode, setJanCode] = useState("");

  const [items, setItems] = useState<Item[]>([]);

  const fetchItems = async () => {
    const res = await fetch("/api/items");
    const data = await res.json();

    setItems(data);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const createItem = async () => {
    await fetch("/api/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        janCode,
      }),
    });

    setName("");
    setJanCode("");

    fetchItems();
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">
        商品管理
      </h1>

      <div className="flex flex-col gap-4 max-w-md mb-10">
        <input
          type="text"
          placeholder="商品名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border p-2 rounded"
        />

        <input
          type="text"
          placeholder="JANコード"
          value={janCode}
          onChange={(e) => setJanCode(e.target.value)}
          className="border p-2 rounded"
        />

        <button
          onClick={createItem}
          className="bg-black text-white p-2 rounded"
        >
          登録
        </button>
      </div>

      <div className="border rounded overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-3 border-b">
                商品名
              </th>

              <th className="text-left p-3 border-b">
                JANコード
              </th>
            </tr>
          </thead>

          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="p-3 border-b">
                  {item.name}
                </td>

                <td className="p-3 border-b">
                  {item.janCode}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}