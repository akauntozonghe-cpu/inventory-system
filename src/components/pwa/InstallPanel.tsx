"use client";
import Link from "next/link";
import InstallButton from "./InstallButton";
import InstallDiagnostics from "./InstallDiagnostics";
export default function InstallPanel() {
  return <section aria-labelledby="admin-install-title" className="mb-6 rounded-2xl border-2 border-blue-300 bg-white p-5 text-slate-950 shadow-sm">
    <h2 id="admin-install-title" className="text-xl font-black">この端末のホーム画面に追加</h2>
    <p className="mt-2 text-sm">下のボタンから追加できます。iPhone・iPadでは共有メニューからの追加手順を表示します。端末ごとに設定してください。</p>
    <div className="flex flex-wrap items-center gap-4"><InstallButton /><Link href="/install" className="font-bold text-blue-700 underline">追加できない場合の手順</Link></div>
    <p className="text-sm text-slate-600">追加後は、ホーム画面の「在庫管理」アイコンから起動してください。</p>
    <InstallDiagnostics />
  </section>;
}
