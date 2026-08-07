import Link from "next/link";

export default function InventoryPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6 text-white">
      <h1 className="text-3xl font-bold">
        在庫一覧
      </h1>

      <p className="mt-3 text-slate-300">
        商品名・JANコードから在庫を検索できます。
      </p>

      <Link
        href="/inventory-search"
        className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3 font-bold hover:bg-blue-700"
      >
        在庫を検索する
      </Link>
    </main>
  );
}