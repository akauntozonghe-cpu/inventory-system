import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-lg rounded-3xl bg-white p-6 text-center shadow-xl sm:p-8">
        <p className="text-sm font-black text-blue-700">ページが見つかりません</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">
          URLまたは対象データを確認してください
        </h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">
          商品や棚卸が削除済みの場合も、この画面が表示されます。
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-blue-700 px-6 py-3 font-black text-white hover:bg-blue-800"
        >
          ホームへ戻る
        </Link>
      </section>
    </main>
  );
}
