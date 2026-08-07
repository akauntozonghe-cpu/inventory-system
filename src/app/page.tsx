"use client";

import Link from "next/link";

const menus = [
  {
    title: "棚卸開始",
    description: "新しい棚卸を開始します",
    href: "/stocktake/start",
    icon: "📦",
    color: "bg-blue-500",
  },
  {
    title: "在庫検索",
    description: "JAN・商品名などで検索",
    href: "/inventory-search",
    icon: "🔍",
    color: "bg-green-500",
  },
  {
    title: "商品一覧",
    description: "登録商品を見る",
    href: "/items",
    icon: "📋",
    color: "bg-orange-500",
  },
  {
    title: "棚卸履歴",
    description: "過去の棚卸を見る",
    href: "/history",
    icon: "🕒",
    color: "bg-purple-500",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-7xl mx-auto">

        <h1 className="text-4xl font-bold">
          在庫管理システム
        </h1>

        <p className="text-gray-500 mt-2">
          棚卸・検索・在庫管理
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mt-10">

          {menus.map((menu) => (
            <Link
              key={menu.href}
              href={menu.href}
            >
              <div className="bg-white rounded-xl shadow hover:shadow-xl transition p-6 h-full cursor-pointer">

                <div
                  className={`${menu.color} w-14 h-14 rounded-xl flex items-center justify-center text-3xl text-white`}
                >
                  {menu.icon}
                </div>

                <h2 className="mt-5 text-xl font-semibold">
                  {menu.title}
                </h2>

                <p className="text-gray-500 mt-2">
                  {menu.description}
                </p>

              </div>
            </Link>
          ))}

        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">

          <div className="bg-white rounded-xl shadow p-6">
            <div className="text-gray-500">
              登録商品数
            </div>

            <div className="text-4xl font-bold mt-3">
              --
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="text-gray-500">
              進行中棚卸
            </div>

            <div className="text-4xl font-bold mt-3">
              --
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="text-gray-500">
              今日の棚卸
            </div>

            <div className="text-4xl font-bold mt-3">
              --
            </div>
          </div>

        </div>

      </div>
    </main>
  );
}