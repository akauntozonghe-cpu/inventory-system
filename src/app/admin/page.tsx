"use client";

import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-5xl">

        <div className="mb-8">
          <h1 className="text-4xl font-bold">
            ⚙ 管理者メニュー
          </h1>

          <p className="mt-2 text-gray-500">
            Inventory OS 管理画面
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">

          <Link
            href="/items"
            className="rounded-2xl bg-white p-6 shadow hover:shadow-lg"
          >
            <div className="text-4xl">📦</div>
            <div className="mt-3 text-xl font-bold">
              商品管理
            </div>
          </Link>

          <Link
            href="/locations"
            className="rounded-2xl bg-white p-6 shadow hover:shadow-lg"
          >
            <div className="text-4xl">📍</div>
            <div className="mt-3 text-xl font-bold">
              保管場所
            </div>
          </Link>

          <Link
            href="/stocktake"
            className="rounded-2xl bg-white p-6 shadow hover:shadow-lg"
          >
            <div className="text-4xl">📋</div>
            <div className="mt-3 text-xl font-bold">
              棚卸
            </div>
          </Link>

          <Link
            href="/history"
            className="rounded-2xl bg-white p-6 shadow hover:shadow-lg"
          >
            <div className="text-4xl">📊</div>
            <div className="mt-3 text-xl font-bold">
              履歴
            </div>
          </Link>

          <Link
            href="/test"
            className="rounded-2xl bg-white p-6 shadow hover:shadow-lg"
          >
            <div className="text-4xl">🧪</div>
            <div className="mt-3 text-xl font-bold">
              テストモード
            </div>
          </Link>

          <Link
            href="/reset"
            className="rounded-2xl bg-white p-6 shadow hover:shadow-lg"
          >
            <div className="text-4xl">🧹</div>
            <div className="mt-3 text-xl font-bold">
              リセット
            </div>
          </Link>

        </div>

        <div className="mt-8">
          <Link
            href="/"
            className="rounded-xl bg-blue-600 px-5 py-3 text-white"
          >
            ← ホームへ戻る
          </Link>
        </div>

      </div>
    </main>
  );
}