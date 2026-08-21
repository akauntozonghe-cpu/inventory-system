"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
  janCode?: string;
  manufacturer?: string;
  managementCode?: string;
};

export default function InventorySearchPage() {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const search = async () => {
      if (!keyword.trim()) {
        setItems([]);
        return;
      }

      setLoading(true);

      try {
        const res = await fetch(
          `/api/items/search?q=${encodeURIComponent(keyword)}`
        );

        const data = await res.json();

        setItems(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(search, 300);

    return () => clearTimeout(timer);
  }, [keyword]);

  return (
    <main className="max-w-6xl mx-auto p-8">

      <h1 className="text-3xl font-bold mb-6">
        商品検索
      </h1>

      <input
        className="w-full border rounded-lg p-4 text-lg"
        placeholder="JAN・商品名・管理番号・メーカー"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />

      {loading && (
        <p className="mt-5">
          検索中...
        </p>
      )}

      <div className="mt-6 space-y-4">

        {items.map((item) => (

          <div
            key={item.id}
            className="border rounded-xl p-5 bg-white shadow"
          >
            <div className="text-xl font-bold">
              {item.name}
            </div>

            <div className="text-gray-500 mt-2">
              JAN：
              {item.janCode || "-"}
            </div>

            <div className="text-gray-500">
              管理番号：
              {item.managementCode || "-"}
            </div>

            <div className="text-gray-500">
              メーカー：
              {item.manufacturer || "-"}
            </div>

          </div>

        ))}

      </div>

    </main>
  );
}