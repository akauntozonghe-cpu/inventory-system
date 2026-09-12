import Link from "@/components/auth/PermissionLink";
import ZaicoImportPanel from "@/components/inventory/ZaicoImportPanel";
export default function ImportPage() {
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-6xl"><header className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold">在庫データの取り込み</h1><Link href="/admin" className="text-indigo-700 underline">管理画面へ</Link></header><ZaicoImportPanel/></div></main>;
}
