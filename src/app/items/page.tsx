"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  name: string;
  janCode: string | null;
};

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);

  const [name, setName] = useState("");
  const [janCode, setJanCode] = useState("");

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(false);

  async function fetchItems() {
    setLoading(true);

    try {
      const res = await fetch("/api/inventory");
      
      const data = await res.json();

      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchItems();
  }, []);

  async function createItem() {
    if (!name.trim()) return;

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
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const keyword = search.toLowerCase();

      return (
        item.name.toLowerCase().includes(keyword) ||
        (item.janCode ?? "").includes(keyword)
      );
    });
  }, [items, search]);

  return (
    <div className="min-h-screen bg-slate-100">

      <div className="max-w-7xl mx-auto p-8">

        <div className="flex items-center justify-between mb-8">

          <div>

            <h1 className="text-4xl font-bold">
              商品管理
            </h1>

            <p className="text-gray-500 mt-2">
              商品マスタ管理
            </p>

          </div>

          <button
            className="px-5 py-3 rounded-xl bg-black text-white hover:bg-gray-800"
          >
            Excel取込
          </button>

        </div>

        <div className="grid grid-cols-4 gap-5 mb-8">

          <div className="bg-white rounded-xl shadow p-6">

            <p className="text-gray-500 text-sm">
              商品数
            </p>

            <h2 className="text-4xl font-bold mt-2">
              {items.length}
            </h2>

          </div>

          <div className="bg-white rounded-xl shadow p-6">

            <p className="text-gray-500 text-sm">
              検索結果
            </p>

            <h2 className="text-4xl font-bold mt-2">
              {filteredItems.length}
            </h2>

          </div>

          <div className="bg-white rounded-xl shadow p-6">

            <p className="text-gray-500 text-sm">
              JAN登録済
            </p>

            <h2 className="text-4xl font-bold mt-2">

              {
                items.filter(
                  (i) => i.janCode
                ).length
              }

            </h2>

          </div>

          <div className="bg-white rounded-xl shadow p-6">

            <p className="text-gray-500 text-sm">
              読み込み
            </p>

            <h2 className="text-2xl font-bold mt-3">

              {loading ? "Loading..." : "Ready"}

            </h2>

          </div>

        </div>

        <div className="grid lg:grid-cols-3 gap-6">

          <div className="bg-white rounded-xl shadow p-6">

            <h2 className="text-xl font-semibold mb-6">
              商品登録
            </h2>

            <div className="space-y-4">

              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="商品名"
                className="w-full border rounded-lg p-3"
              />

              <input
                value={janCode}
                onChange={(e) => setJanCode(e.target.value)}
                placeholder="JANコード"
                className="w-full border rounded-lg p-3"
              />

              <button
                onClick={createItem}
                className="w-full rounded-lg bg-blue-600 text-white p-3 hover:bg-blue-700"
              >
                商品登録
              </button>

            </div>

          </div>

          <div className="lg:col-span-2 bg-white rounded-xl shadow p-6">

            <div className="flex justify-between mb-6">

              <h2 className="text-xl font-semibold">
                商品一覧
              </h2>

              <input
                placeholder="商品名・JAN検索"
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                className="border rounded-lg px-4 py-2 w-72"
              />

            </div>

            <div className="overflow-auto rounded-lg border">

              <table className="w-full">

                <thead className="bg-gray-100">

                  <tr>

                    <th className="text-left p-4">
                      商品名
                    </th>

                    <th className="text-left p-4">
                      JAN
                    </th>

                    <th className="text-center p-4">
                      操作
                    </th>

                  </tr>

                </thead>

                                <tbody>

                  {filteredItems.length === 0 ? (

                    <tr>

                      <td
                        colSpan={3}
                        className="text-center p-10 text-gray-500"
                      >
                        商品がありません
                      </td>

                    </tr>

                  ) : (

                    filteredItems.map((item) => (

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

                          <div className="flex justify-center gap-2">

                            <button
                              className="px-3 py-1 rounded bg-sky-600 text-white hover:bg-sky-700"
                            >
                              詳細
                            </button>

                            <button
                              className="px-3 py-1 rounded bg-amber-500 text-white hover:bg-amber-600"
                            >
                              編集
                            </button>

                            <button
                              className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                            >
                              削除
                            </button>

                          </div>

                        </td>

                      </tr>

                    ))

                  )}

                </tbody>

              </table>

            </div>

            <div className="flex justify-between items-center mt-5">

              <div className="text-sm text-gray-500">

                {filteredItems.length} 件表示

              </div>

              <div className="flex gap-2">

                <button
                  className="border rounded-lg px-4 py-2 hover:bg-gray-100"
                >
                  前へ
                </button>

                <button
                  className="border rounded-lg px-4 py-2 hover:bg-gray-100"
                >
                  次へ
                </button>

              </div>

            </div>

          </div>

        </div>

        <div className="grid lg:grid-cols-4 gap-5 mt-8">

          <div className="bg-white rounded-xl shadow p-5">

            <p className="text-gray-500 text-sm">
              最近追加
            </p>

            <p className="font-semibold mt-3">
              {items[0]?.name || "-"}
            </p>

          </div>

          <div className="bg-white rounded-xl shadow p-5">

            <p className="text-gray-500 text-sm">
              JAN未登録
            </p>

            <p className="text-3xl font-bold mt-3">

              {
                items.filter(
                  (i) => !i.janCode
                ).length
              }

            </p>

          </div>

          <div className="bg-white rounded-xl shadow p-5">

            <p className="text-gray-500 text-sm">
              登録率
            </p>

            <p className="text-3xl font-bold mt-3">

              {items.length === 0
                ? "0%"
                : `${Math.round(
                    (items.filter(
                      (i) => i.janCode
                    ).length /
                      items.length) *
                      100
                  )}%`}

            </p>

          </div>

          <div className="bg-white rounded-xl shadow p-5">

            <p className="text-gray-500 text-sm">
              Inventory OS
            </p>

            <p className="font-semibold mt-3">

              Version 1.0

            </p>

          </div>

                </div>

        <div className="mt-8 bg-white rounded-xl shadow">

          <div className="border-b p-6 flex flex-wrap gap-3">

            <button
              onClick={() => location.href = "/import"}
              className="rounded-lg bg-emerald-600 px-5 py-3 text-white hover:bg-emerald-700"
            >
              📥 Excel取込
            </button>

            <button
              onClick={() => location.href = "/scan"}
              className="rounded-lg bg-indigo-600 px-5 py-3 text-white hover:bg-indigo-700"
            >
              📷 バーコード検索
            </button>

            <button
              onClick={fetchItems}
              className="rounded-lg bg-gray-700 px-5 py-3 text-white hover:bg-black"
            >
              🔄 更新
            </button>

          </div>

          <div className="p-6">

            <table className="w-full">

              <thead>

                <tr className="border-b bg-slate-50">

                  <th className="text-left p-4">
                    商品名
                  </th>

                  <th className="text-left p-4">
                    JAN
                  </th>

                  <th className="text-center p-4">
                    操作
                  </th>

                </tr>

              </thead>

              <tbody>

                {filteredItems.map((item) => (

                  <tr
                    key={item.id}
                    className="border-b hover:bg-slate-50"
                  >

                    <td className="p-4">

                      <div className="font-semibold">
                        {item.name}
                      </div>

                    </td>

                    <td className="p-4 font-mono">

                      {item.janCode || "-"}

                    </td>

                    <td className="p-4">

                      <div className="flex justify-center gap-2 flex-wrap">

                        <button
                          onClick={() =>
                            location.href = `/items/${item.id}`
                          }
                          className="rounded-lg bg-sky-600 px-4 py-2 text-white hover:bg-sky-700"
                        >
                          詳細
                        </button>

                        <button
                          onClick={() => {
                            setName(item.name);
                            setJanCode(item.janCode ?? "");
                            window.scrollTo({
                              top: 0,
                              behavior: "smooth",
                            });
                          }}
                          className="rounded-lg bg-orange-500 px-4 py-2 text-white hover:bg-orange-600"
                        >
                          編集
                        </button>

                        <button
                          onClick={async () => {

                            if (
                              !confirm(
                                `${item.name}を削除しますか？`
                              )
                            )
                              return;

                            await fetch(
                              `/api/items?id=${item.id}`,
                              {
                                method: "DELETE",
                              }
                            );

                            fetchItems();

                          }}
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

        </div>

      </div>

    </div>

  );

}