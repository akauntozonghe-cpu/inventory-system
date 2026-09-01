import Link from "next/link";

export default function OfflinePage() {
  return <main className="grid min-h-screen place-items-center bg-slate-100 p-4"><section className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl"><div className="text-5xl">📡</div><h1 className="mt-4 text-2xl font-black">通信を確認してください</h1><p className="mt-3 font-semibold text-slate-600">在庫数や棚卸結果の食い違いを防ぐため、オフライン中の登録・更新は確定しません。通信が戻ったらもう一度お試しください。</p><Link href="/" className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-3 font-black text-white">ホームを再確認</Link></section></main>;
}
