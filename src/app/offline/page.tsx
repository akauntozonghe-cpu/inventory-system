import Link from "next/link";

export default function OfflinePage() {
  return <main className="relative grid min-h-screen overflow-hidden bg-slate-950 p-5 text-white">
    <div className="absolute -left-32 top-10 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" /><div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />
    <section className="relative m-auto w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/15 bg-white/[.07] p-7 text-center shadow-2xl backdrop-blur-xl sm:p-10">
      <img src="/pwa-icon.svg" alt="Inventory OS" className="mx-auto h-24 w-24 rounded-[1.75rem] shadow-[0_20px_50px_rgba(14,165,233,.3)]" />
      <p className="mt-6 text-xs font-black tracking-[.3em] text-cyan-300">SAFE OFFLINE MODE</p><h1 className="mt-2 text-3xl font-black">通信を待っています</h1>
      <p className="mx-auto mt-4 max-w-md font-semibold leading-7 text-slate-300">在庫差異と二重登録を防ぐため、オフライン中は更新を確定しません。閲覧中の内容はそのまま保持されます。</p>
      <div className="mt-7 grid grid-cols-3 gap-2 text-xs font-bold"><div className="rounded-2xl bg-white/10 p-3"><span className="block text-xl">🔒</span>安全保持</div><div className="rounded-2xl bg-white/10 p-3"><span className="block text-xl">↻</span>自動検知</div><div className="rounded-2xl bg-white/10 p-3"><span className="block text-xl">✓</span>重複防止</div></div>
      <Link href="/" className="mt-7 inline-flex rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3.5 font-black text-slate-950 shadow-lg">接続を再確認</Link>
    </section>
  </main>;
}

