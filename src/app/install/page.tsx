import Link from "@/components/auth/PermissionLink";
import InstallAction from "@/components/pwa/InstallAction";
import InstallDiagnostics from "@/components/pwa/InstallDiagnostics";

export default function InstallPage() {
  return <main className="min-h-screen bg-slate-100 p-4 text-slate-950 sm:p-8"><div className="mx-auto max-w-2xl rounded-3xl bg-white p-5 shadow-sm sm:p-8">
    <Link href="/settings" className="inline-block rounded-xl border px-4 py-3 text-sm font-bold">設定へ戻る</Link>
    <h1 className="mt-6 text-2xl font-black">ホーム画面に追加</h1>
    <p className="mt-3 leading-7 text-slate-600">このページが表示されていれば、管理者画面からの操作は届いています。端末への追加は、ブラウザの確認画面で行います。</p>
    <InstallAction />
    <h2 className="mt-6 text-lg font-black">ボタンから追加できない場合</h2>
    <p className="mt-3 leading-7">Pixel・Android：Chrome右上の「︙」→「ホーム画面に追加」または「アプリをインストール」。項目がない場合は、下の状態確認を開いてください。</p>
    <p className="mt-3 leading-7">iPhone・iPad：Safariの共有ボタン→「ホーム画面に追加」。PC：Chrome・Edgeのメニューからインストールします。</p>
    <InstallDiagnostics />
    <p className="mt-5 text-sm leading-6 text-slate-600">アプリ内からブラウザの制限を解除することはできません。追加画面が出ないだけで「追加済み」とは判断しません。</p>
  </div></main>;
}
