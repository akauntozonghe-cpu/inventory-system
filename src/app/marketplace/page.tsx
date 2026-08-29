import Link from "next/link";

const functions = [
  { href: "/admin/marketplace", icon: "📦", title: "出品・販売管理", description: "保管在庫から出品候補を作り、出品中・売却済みまで管理します。" },
  { href: "/admin/marketplace/advisor", icon: "💰", title: "価格・送料・利益", description: "原価、販売手数料、梱包費、送料を含めて利益を比較します。" },
  { href: "/admin/marketplace/settings", icon: "⚙️", title: "フリマ設定", description: "販売先、手数料、発送方法、地域と利益目標を設定します。" },
];

export default function MarketplaceHomePage() {
  return <main className="min-h-screen bg-violet-50 p-4 text-slate-950 sm:p-8"><div className="mx-auto max-w-6xl"><header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-black tracking-[0.2em] text-violet-700">FLEA MARKET</p><h1 className="mt-1 text-3xl font-black">フリマ販売</h1><p className="mt-2 text-slate-600">出品準備から売却・在庫反映までを一か所で管理します。</p></div><Link href="/" className="rounded-xl bg-white px-5 py-3 font-black text-violet-800 shadow-sm">ホームへ戻る</Link></header><section className="mt-8 grid gap-5 md:grid-cols-3">{functions.map((item) => <Link key={item.href} href={item.href} className="rounded-3xl bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="text-4xl">{item.icon}</div><h2 className="mt-4 text-xl font-black">{item.title}</h2><p className="mt-2 leading-6 text-slate-600">{item.description}</p><p className="mt-5 font-black text-violet-700">開く →</p></Link>)}</section><section className="mt-6 rounded-3xl bg-slate-900 p-6 text-white"><h2 className="text-xl font-black">在庫の扱い</h2><p className="mt-2 leading-7 text-slate-200">出品準備・出品中の商品はフリマ引当として保管在庫と分けます。売却確定時に在庫を減らし、操作履歴へ記録します。</p></section></div></main>;
}
