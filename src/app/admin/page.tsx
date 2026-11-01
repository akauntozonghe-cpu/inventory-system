"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, ClipboardList, Database, Search, Settings2, ShieldCheck, Users, X } from "lucide-react";
import DeviceNotifications from "@/components/pwa/DeviceNotifications";
import InstallPanel from "@/components/pwa/InstallPanel";
import { useAppAccess } from "@/components/auth/AppAccessProvider";
import Link from "@/components/auth/PermissionLink";
import {
  destructiveDestinations,
  filterManagementSections,
  managementDestination,
  managementSections,
  managementShortcuts,
  type ManagementDestination,
} from "@/lib/management-navigation";

const sectionIcons = {
  work: ClipboardList,
  catalog: Database,
  people: Users,
  system: ShieldCheck,
} as const;

function DestinationCard({ destination }: { destination: ManagementDestination }) {
  return (
    <Link
      href={destination.href}
      className="group flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-400 hover:bg-blue-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
    >
      <div className="min-w-0">
        <h3 className="break-words font-black text-slate-900">{destination.title}</h3>
        <p className="mt-1 break-words text-sm leading-6 text-slate-600">{destination.description}</p>
      </div>
      <ArrowUpRight size={19} className="mt-1 shrink-0 text-slate-400 transition group-hover:text-blue-700" aria-hidden />
    </Link>
  );
}

export default function AdminPage() {
  const {user,ready}=useAppAccess();
  const [query,setQuery]=useState("");
  const searched=useMemo(()=>filterManagementSections(query),[query]);
  const matchCount=searched.reduce((sum,section)=>sum+section.destinations.length,0);
  const totalCount=managementSections.reduce((sum,section)=>sum+section.destinations.length,0);
  const canManage=user?.role==="ADMIN";

  if(!ready){
    return <main className="mx-auto max-w-6xl p-6" role="status"><p className="rounded-xl bg-white p-6 font-bold">管理権限を確認しています…</p></main>;
  }
  if(!canManage){
    return <main className="mx-auto max-w-xl p-4 sm:p-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-black">管理者権限が必要です</h1>
        <p className="mt-3 text-slate-600">管理センターは管理者のみ利用できます。通常の検索・棚卸はホームから行えます。</p>
        <Link href="/" className="mt-5 inline-flex rounded-xl bg-blue-700 px-4 py-3 font-bold text-white">ホームに戻る</Link>
      </section>
    </main>;
  }

  return <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-6 sm:py-7">
    <div className="mx-auto max-w-6xl">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-widest text-blue-700">INVENTORY OS</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">管理センター</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              何を管理したいか選んでください。商品・棚卸・利用者・システムの設定を目的別にまとめています。
            </p>
          </div>
          <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
            <CheckCircle2 size={16} aria-hidden />
            {user.baseRole && user.baseRole!=="ADMIN" ? "一時管理者モード" : "管理者として操作中"}
          </span>
        </div>
        <label htmlFor="management-search" className="mt-5 block text-sm font-bold">管理機能を探す</label>
        <div className="relative mt-2">
          <Search size={20} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
          <input id="management-search" type="search" value={query} onChange={event=>setQuery(event.target.value)}
            placeholder="例：商品削除、権限、棚卸、エラー、CSV"
            className="min-h-12 w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-12 text-base outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"/>
          {query && <button type="button" onClick={()=>setQuery("")} aria-label="管理機能の検索を解除する"
            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg hover:bg-slate-100"><X size={19} aria-hidden/></button>}
        </div>
        <p role="status" className="mt-2 text-sm text-slate-600">{query.trim()? `${matchCount}件の管理機能が見つかりました` : `${totalCount}件の管理機能を4つの分野に整理しています`}</p>
      </header>

      {!query.trim() && <>
        <section aria-labelledby="quick-management-title" className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="quick-management-title" className="text-lg font-black">よく使う管理操作</h2>
            <p className="text-sm text-slate-600">それぞれの管理画面へ移動します</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {managementShortcuts.map(href=>{const destination=managementDestination(href);return destination
              ? <DestinationCard key={href} destination={destination}/>
              : null;})}
          </div>
        </section>
        <nav aria-label="管理機能の分野に移動" className="mt-7 flex flex-wrap gap-2">
          {managementSections.map(section=><a key={section.id} href={`#manage-${section.id}`}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-blue-500 hover:text-blue-800">{section.title}</a>)}
        </nav>
      </>}

      <div className="mt-5 space-y-6">
        {searched.map(section=>{
          const Icon=sectionIcons[section.id as keyof typeof sectionIcons]??Settings2;
          return <section id={`manage-${section.id}`} key={section.id} aria-labelledby={`manage-title-${section.id}`}
            className="scroll-mt-20 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700 ring-1 ring-slate-200">
                <Icon size={20} aria-hidden/>
              </div>
              <div className="min-w-0">
                <h2 id={`manage-title-${section.id}`} className="text-lg font-black">{section.title}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">{section.description}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {section.destinations.map(destination=><DestinationCard key={destination.href} destination={destination}/>)}
            </div>
          </section>;
        })}
        {matchCount===0 && <section className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="font-bold">該当する管理機能がありません</p>
          <p className="mt-2 text-sm text-slate-600">「棚卸」「商品」「権限」「出力」などの言葉で検索してください。</p>
          <button type="button" onClick={()=>setQuery("")} className="mt-4 rounded-lg border px-4 py-2 font-bold">すべて表示</button>
        </section>}
      </div>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <details>
          <summary className="cursor-pointer py-1 font-black">端末設定・通知・アプリのインストール</summary>
          <p className="mt-2 text-sm text-slate-600">端末固有の設定です。商品や棚卸データの変更とは分けています。</p>
          <div className="mt-3 space-y-4"><DeviceNotifications/><InstallPanel/></div>
        </details>
      </section>

      <section aria-labelledby="danger-zone-title" className="mt-7 rounded-2xl border border-red-200 bg-white p-4 sm:p-5">
        <details>
          <summary id="danger-zone-title" className="cursor-pointer font-black text-red-800">
            <span className="inline-flex items-center gap-2"><AlertTriangle size={19} aria-hidden/>注意が必要な操作</span>
          </summary>
          <p className="mt-3 text-sm leading-6 text-slate-700">通常の商品の削除・整理では、データ初期化を使用しないでください。初期化は独立した操作です。</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{destructiveDestinations.map(destination=>
            <Link href={destination.href} key={destination.href} className="block rounded-xl border border-red-200 bg-red-50 p-4 hover:border-red-500">
              <h3 className="font-black text-red-900">{destination.title}</h3>
              <p className="mt-1 text-sm leading-6 text-red-900">{destination.description}</p>
            </Link>)}</div>
        </details>
      </section>
    </div>
  </main>;
}
