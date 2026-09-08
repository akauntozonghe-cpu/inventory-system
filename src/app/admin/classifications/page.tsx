"use client";
import Pagination from "@/components/common/Pagination";
import SectionNavigation, { classificationLinks } from "@/components/common/SectionNavigation";
import { parseScan } from "@/lib/scan-payload";
import { fetchFresh } from "@/lib/fetch-fresh";

import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import FeedbackToast from "@/components/common/FeedbackToast";
import UnifiedScanner from "@/components/stocktake/UnifiedScanner";

type Classification = { id: string; kind: "MAJOR" | "MINOR"; name: string; parentName: string; labelCode?: string; itemCount: number; inventoryCount: number };
type Location = { id: string; name: string; description: string | null; _count: { inventories: number; itemRegistrationRequests: number } };
type ItemRow = { id: string; name: string; janCode: string | null; systemBarcode: string | null; majorCategory: string | null; minorCategory: string | null; inventoryCount: number; totalQuantity: number };
type Payload = { classifications: Classification[]; locations: Location[]; items: ItemRow[] };

function normalizeCode(value: string) { return value.normalize("NFKC").replace(/[\s-]/g, "").toLowerCase(); }

function normalizePayload(value: unknown): Payload {
  const source = value && typeof value === "object" ? value as Partial<Payload> : {};
  return {
    classifications: Array.isArray(source.classifications) ? source.classifications : [],
    locations: Array.isArray(source.locations) ? source.locations : [],
    items: Array.isArray(source.items) ? source.items : [],
  };
}

export default function ClassificationsPage() {
  const [page, setPage] = useState(1);
  const loadSequence = useRef(0);
  const [masterSearch, setMasterSearch] = useState("");
  const [data, setData] = useState<Payload>({ classifications: [], locations: [], items: [] });
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [majorName, setMajorName] = useState(""); const [minorName, setMinorName] = useState(""); const [minorParent, setMinorParent] = useState("");
  const [locationName, setLocationName] = useState(""); const [locationDescription, setLocationDescription] = useState("");
  const [edit, setEdit] = useState<{ type: "MAJOR" | "MINOR" | "LOCATION"; source: string; sourceId?: string; parentName?: string } | null>(null);
  const [target, setTarget] = useState(""); const [targetParent, setTargetParent] = useState("");
  const [itemSearch, setItemSearch] = useState(""); const [itemMajorFilter, setItemMajorFilter] = useState("ALL");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]); const [assignMajor, setAssignMajor] = useState(""); const [assignMinor, setAssignMinor] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [locationQr, setLocationQr] = useState<{ name: string; image: string } | null>(null);

  const load = useCallback(async () => { const sequence = ++loadSequence.current; const response = await fetchFresh("/api/admin/classifications"); const payload: unknown = await response.json().catch(() => null); if (!response.ok) { const message = payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string" ? payload.message : "分類を取得できませんでした。"; throw new Error(message); } if (sequence === loadSequence.current) setData(normalizePayload(payload)); }, []);
  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : "分類を取得できませんでした。")); }, [load]);
  const majors = useMemo(() => data.classifications.filter((row) => row.kind === "MAJOR"), [data.classifications]);
  const minors = useMemo(() => data.classifications.filter((row) => row.kind === "MINOR"), [data.classifications]);
  const liveFailed = useLiveRefresh(load);
  const matchesMaster = (name: string) => name.normalize("NFKC").toLocaleLowerCase("ja").includes(masterSearch.normalize("NFKC").trim().toLocaleLowerCase("ja"));
  const visibleItems = useMemo(() => { const query = itemSearch.trim().toLocaleLowerCase("ja"); return data.items.filter((item) => (itemMajorFilter === "ALL" || (itemMajorFilter === "NONE" ? !item.majorCategory : item.majorCategory === itemMajorFilter)) && (!query || [item.name,item.janCode,item.systemBarcode,item.majorCategory,item.minorCategory].filter(Boolean).join(" ").toLocaleLowerCase("ja").includes(query))); }, [data.items, itemMajorFilter, itemSearch]);
  const pages = Math.max(1, Math.ceil(visibleItems.length / 100));
  const currentPage = Math.min(page, pages);
  const pageRows = visibleItems.slice((currentPage-1)*100, currentPage*100);
  const assignableMinors = useMemo(() => minors.filter((row) => row.parentName === assignMajor), [assignMajor, minors]);

  const execute = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try { const response = await fetch("/api/admin/classifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(`${payload.message ?? "更新できませんでした。"}${payload.code ? `（${payload.code}）` : ""}`); setNotice(payload.message); setEdit(null); setTarget(""); setTargetParent(""); setSelectedItemIds([]); await load(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "更新できませんでした。"); return false; } finally { setBusy(false); }
  };

  const handleScan = (raw: string) => {
    setScannerOpen(false); setError("");
    const scanned = parseScan(raw);
    if (scanned.type === "INVALID") { setError("対応していないQRです。商品・大分類・保管場所のラベルを読み取ってください。"); return; }
    if (scanned.type === "CLASSIFICATION") {
      const row = majors.find((candidate) => (scanned.code && candidate.labelCode === scanned.code) || (scanned.name && candidate.name === scanned.name));
      if (!row) { setError("読み取った大分類は現在の分類一覧にありません。ラベルを再発行するか、分類情報を確認してください。（CLASSIFICATION_SCAN_NOT_FOUND）"); return; }
      setItemMajorFilter(row.name); setItemSearch(""); setNotice(`「${row.name}」の商品に絞り込みました。`);
      requestAnimationFrame(() => document.getElementById("classification-items")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    if (scanned.type === "LOCATION") {
      const row = data.locations.find((candidate) => (scanned.id && candidate.id === scanned.id) || (scanned.name && candidate.name === scanned.name));
      if (!row) { setError("読み取った保管場所は現在の一覧にありません。ラベルを再発行してください。（LOCATION_SCAN_NOT_FOUND）"); return; }
      setEdit({ type: "LOCATION", source: row.name, sourceId: row.id }); setTarget(""); setNotice(`保管場所「${row.name}」を開きました。`); return;
    }
    const code = normalizeCode(scanned.code ?? "");
    const matches = data.items.filter((item) => [item.janCode, item.systemBarcode].some((candidate) => candidate && normalizeCode(candidate) === code));
    if (matches.length === 0) { setItemSearch(scanned.code ?? ""); setError("該当商品がありません。検索欄に読取値を入れました。（ITEM_SCAN_NOT_FOUND）"); return; }
    setItemSearch(scanned.code ?? ""); setItemMajorFilter("ALL"); setSelectedItemIds(matches.map((item) => item.id)); setNotice(`${matches.length}件の商品を選択しました。変更先の分類を指定できます。`);
    requestAnimationFrame(() => document.getElementById("classification-items")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const showLocationQr = async (row: Location) => {
    const value = JSON.stringify({ type: "INVENTORY_LOCATION_LABEL", storageLocationId: row.id, storageLocationName: row.name });
    try { setLocationQr({ name: row.name, image: await QRCode.toDataURL(value, { width: 640, margin: 4, errorCorrectionLevel: "H" }) }); }
    catch { setError("保管場所QRを生成できませんでした。（LOCATION_QR_GENERATE_FAILED）"); }
  };

  return <main className="min-h-screen bg-slate-100 p-4 text-slate-950 sm:p-8">
    <FeedbackToast tone="error" title="分類編集エラー" message={error} onClose={() => setError("")} />
    <FeedbackToast tone="success" title="更新完了" message={notice} autoCloseMs={5000} onClose={() => setNotice("")} />
    <div className="mx-auto max-w-7xl"><header className="flex flex-wrap justify-between gap-4"><div><p className="text-sm font-black tracking-widest text-indigo-700">CLASSIFICATION CONTROL</p><h1 className="mt-1 text-3xl font-black">分類・保管場所の整理</h1><p className="mt-2 text-slate-600">追加、名称変更、統合、移動、未使用分類の削除を、商品・在庫・棚卸範囲へ一括反映します。</p></div><div className="flex h-fit flex-wrap gap-2"><button onClick={()=>setScannerOpen(true)} className="rounded-xl bg-indigo-600 px-4 py-3 font-black text-white">JAN・QRで検索</button><Link href="/admin" className="rounded-xl bg-slate-800 px-4 py-3 font-black text-white">システム管理へ</Link></div></header><SectionNavigation label="分類管理" current="/admin/classifications" links={classificationLinks} />
      <section className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-bold text-indigo-950">JAN・商品QRは商品の選択、大分類QRは分類の絞り込みに使います。保管場所QRは棚や箱に貼り、その場所の在庫を探すためのラベルです。この画面では場所の編集を開きます。</section>
      {liveFailed && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3">最新情報を確認できていません。通信が戻ると再取得します。</p>}<input aria-label="分類・保管場所を検索" value={masterSearch} onChange={e=>setMasterSearch(e.target.value)} placeholder="分類名・保管場所名を検索" className="mt-5 w-full rounded-xl border bg-white p-3"/><section id="locations" className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">大分類</h2><div className="mt-4 flex gap-2"><input value={majorName} onChange={(e)=>setMajorName(e.target.value)} placeholder="追加する大分類" className="min-w-0 flex-1 rounded-xl border p-3"/><button disabled={busy||!majorName.trim()} onClick={()=>void execute({action:"CREATE_CLASSIFICATION",kind:"MAJOR",name:majorName}).then(ok=>{if(ok)setMajorName("");})} className="rounded-xl bg-indigo-600 px-4 font-black text-white disabled:opacity-40">追加</button></div><div className="mt-4 max-h-[500px] space-y-2 overflow-auto">{majors.filter(row=>matchesMaster(row.name)).map(row=><div key={row.id} className="rounded-xl border p-3"><div className="flex justify-between gap-2"><div><p className="font-black">{row.name}</p><p className="text-xs text-slate-500">商品{row.itemCount}件・在庫{row.inventoryCount}件</p></div><button onClick={()=>{setEdit({type:"MAJOR",source:row.name});setTarget("");}} className="rounded-lg bg-slate-100 px-3 font-bold">編集</button></div></div>)}</div></div>
        <div className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">小分類</h2><div className="mt-4 grid gap-2"><select value={minorParent} onChange={(e)=>setMinorParent(e.target.value)} className="rounded-xl border p-3"><option value="">親の大分類</option>{majors.map(row=><option key={row.id}>{row.name}</option>)}</select><div className="flex gap-2"><input value={minorName} onChange={(e)=>setMinorName(e.target.value)} placeholder="追加する小分類" className="min-w-0 flex-1 rounded-xl border p-3"/><button disabled={busy||!minorName.trim()||!minorParent} onClick={()=>void execute({action:"CREATE_CLASSIFICATION",kind:"MINOR",name:minorName,parentName:minorParent}).then(ok=>{if(ok)setMinorName("");})} className="rounded-xl bg-cyan-600 px-4 font-black text-white disabled:opacity-40">追加</button></div></div><div className="mt-4 max-h-[500px] space-y-2 overflow-auto">{minors.filter(row=>matchesMaster(row.parentName+" "+row.name)).map(row=><div key={row.id} className="rounded-xl border p-3"><div className="flex justify-between gap-2"><div><p className="font-black">{row.name}</p><p className="text-xs text-slate-500">{row.parentName}／商品{row.itemCount}件</p></div><button onClick={()=>{setEdit({type:"MINOR",source:row.name,parentName:row.parentName});setTarget("");setTargetParent(row.parentName);}} className="rounded-lg bg-slate-100 px-3 font-bold">編集</button></div></div>)}</div></div>
        <div className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">保管場所</h2><div className="mt-4 grid gap-2"><input value={locationName} onChange={(e)=>setLocationName(e.target.value)} placeholder="追加する保管場所" className="rounded-xl border p-3"/><input value={locationDescription} onChange={(e)=>setLocationDescription(e.target.value)} placeholder="説明" className="rounded-xl border p-3"/><button disabled={busy||!locationName.trim()} onClick={()=>void execute({action:"CREATE_LOCATION",name:locationName,description:locationDescription}).then(ok=>{if(ok){setLocationName("");setLocationDescription("");}})} className="rounded-xl bg-emerald-600 p-3 font-black text-white disabled:opacity-40">保管場所を追加</button></div><div className="mt-4 max-h-[500px] space-y-2 overflow-auto">{data.locations.filter(row=>matchesMaster(row.name)).map(row=><div key={row.id} className="rounded-xl border p-3"><div className="flex justify-between gap-2"><div><p className="font-black">{row.name}</p><p className="text-xs text-slate-500">在庫明細{row._count.inventories}件</p></div><div className="flex gap-2"><button onClick={()=>void showLocationQr(row)} className="rounded-lg bg-emerald-50 px-3 font-bold text-emerald-800">QR</button><button onClick={()=>{setEdit({type:"LOCATION",source:row.name,sourceId:row.id});setTarget("");}} className="rounded-lg bg-slate-100 px-3 font-bold">編集</button></div></div></div>)}</div></div>
      </section>
      <section id="classification-items" className="mt-6 scroll-mt-4 rounded-3xl bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-black">分類に登録する商品の編集</h2><p className="mt-1 text-sm font-semibold text-slate-600">商品を選び、分類への追加・変更・除外を一括実行します。一部の商品だけ新分類へ移すと分類を分割できます。</p></div><div className="flex gap-2"><button onClick={()=>setScannerOpen(true)} className="rounded-xl bg-slate-800 px-4 py-2 font-black text-white">コードで商品選択</button><p className="rounded-xl bg-indigo-50 px-4 py-2 font-black text-indigo-800">選択 {selectedItemIds.length}件</p></div></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px]"><input value={itemSearch} onChange={(e)=>{setItemSearch(e.target.value);setPage(1);}} placeholder="商品名・JAN・管理コード・分類で検索" className="rounded-xl border p-3"/><select value={itemMajorFilter} onChange={(e)=>{setItemMajorFilter(e.target.value);setPage(1);}} className="rounded-xl border p-3 font-bold"><option value="ALL">すべての大分類</option><option value="NONE">大分類未設定</option>{majors.map(row=><option key={row.id} value={row.name}>{row.name}</option>)}</select></div>
        <div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>setSelectedItemIds(pageRows.map(item=>item.id))} className="rounded-xl bg-slate-200 px-4 py-2 font-bold">このページを全選択</button><button onClick={()=>setSelectedItemIds([])} className="rounded-xl bg-slate-200 px-4 py-2 font-bold">選択解除</button></div>
        <Pagination page={currentPage} totalPages={pages} start={(currentPage-1)*100} end={Math.min(currentPage*100, visibleItems.length)} total={visibleItems.length} onPageChange={setPage} />
        <div className="mt-3 max-h-[420px] overflow-auto rounded-2xl border"><table className="w-full min-w-[760px] text-left"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-3">選択</th><th className="p-3">商品</th><th className="p-3">現在の分類</th><th className="p-3">在庫</th></tr></thead><tbody>{pageRows.map(item=><tr key={item.id} className="border-t"><td className="p-3"><input type="checkbox" checked={selectedItemIds.includes(item.id)} onChange={(e)=>setSelectedItemIds(current=>e.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))} className="h-5 w-5"/></td><td className="p-3"><p className="font-black">{item.name}</p><p className="text-xs text-slate-500">{item.janCode||item.systemBarcode||"コードなし"}</p></td><td className="p-3 font-bold">{item.majorCategory||"未設定"} ／ {item.minorCategory||"未設定"}</td><td className="p-3">{item.totalQuantity}（明細{item.inventoryCount}件）</td></tr>)}</tbody></table></div>
        <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 lg:grid-cols-[1fr_1fr_auto]"><select value={assignMajor} onChange={(e)=>{setAssignMajor(e.target.value);setAssignMinor("");}} className="rounded-xl border p-3 font-bold"><option value="">変更先の大分類</option>{majors.map(row=><option key={row.id} value={row.name}>{row.name}</option>)}</select><select value={assignMinor} onChange={(e)=>setAssignMinor(e.target.value)} disabled={!assignMajor} className="rounded-xl border p-3 font-bold disabled:opacity-50"><option value="">小分類なし</option>{assignableMinors.map(row=><option key={row.id} value={row.name}>{row.name}</option>)}</select><button disabled={busy||selectedItemIds.length===0||!assignMajor} onClick={()=>void execute({action:"ASSIGN_ITEMS",itemIds:selectedItemIds,majorCategory:assignMajor,minorCategory:assignMinor||null})} className="rounded-xl bg-indigo-700 px-5 py-3 font-black text-white disabled:opacity-40">選択商品を分類変更</button></div>
        <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy||selectedItemIds.length===0} onClick={()=>void execute({action:"ASSIGN_ITEMS",itemIds:selectedItemIds,minorCategory:null})} className="rounded-xl bg-amber-500 px-4 py-3 font-black">小分類から除外</button><button disabled={busy||selectedItemIds.length===0} onClick={()=>void execute({action:"ASSIGN_ITEMS",itemIds:selectedItemIds,majorCategory:null,minorCategory:null})} className="rounded-xl bg-red-600 px-4 py-3 font-black text-white">すべての分類から除外</button></div>
      </section>
    </div>
    {edit&&<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><p className="text-sm font-black text-indigo-700">変更元</p><h2 className="mt-1 text-2xl font-black">{edit.source}</h2><p className="mt-2 text-sm text-slate-600">名称変更は新しい名前を入力します。既存名を指定すると統合になります。在庫・棚卸範囲・履歴の参照も更新されます。</p>{edit.type==="LOCATION"?<select value={target} onChange={(e)=>setTarget(e.target.value)} className="mt-5 w-full rounded-xl border p-3"><option value="">統合先を選択（新名称なら下へ入力）</option>{data.locations.filter(row=>row.id!==edit.sourceId).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>:<input value={target} onChange={(e)=>setTarget(e.target.value)} placeholder="変更・統合先の分類名" className="mt-5 w-full rounded-xl border p-3"/>}{edit.type==="MINOR"&&<select value={targetParent} onChange={(e)=>setTargetParent(e.target.value)} className="mt-3 w-full rounded-xl border p-3">{majors.map(row=><option key={row.id}>{row.name}</option>)}</select>}{edit.type==="LOCATION"&&<input value={target.startsWith("new:")?target.slice(4):""} onChange={(e)=>setTarget(`new:${e.target.value}`)} placeholder="または新しい保管場所名" className="mt-3 w-full rounded-xl border p-3"/>}<div className="mt-5 grid gap-2 sm:grid-cols-3"><button disabled={busy||!target} onClick={()=>{if(edit.type==="LOCATION"){if(target.startsWith("new:"))void execute({action:"RENAME_LOCATION",sourceId:edit.sourceId,target:target.slice(4)});else void execute({action:"MERGE_LOCATION",sourceId:edit.sourceId,targetId:target});}else void execute({action:"RENAME_OR_MERGE_CLASSIFICATION",kind:edit.type,source:edit.source,target,parentName:edit.parentName,targetParent});}} className="rounded-xl bg-indigo-600 p-3 font-black text-white disabled:opacity-40">変更・統合</button>{edit.type!=="LOCATION"&&<button disabled={busy} onClick={()=>void execute({action:"DELETE_CLASSIFICATION",kind:edit.type,source:edit.source,parentName:edit.parentName})} className="rounded-xl bg-red-600 p-3 font-black text-white">未使用なら削除</button>}<button onClick={()=>setEdit(null)} className="rounded-xl bg-slate-200 p-3 font-black">戻る</button></div></section></div>}
    {scannerOpen&&<UnifiedScanner title="JAN・分類・保管場所QRを読む" notice="JANは商品を選択、大分類QRは商品を絞り込み、保管場所QRはその場所を開きます。" onProduct={code=>handleScan(code)} onCategory={name=>handleScan(`INVENTORY_OS:CATEGORY:MAJOR:${encodeURIComponent(name)}`)} onLocation={location=>handleScan(JSON.stringify({type:"INVENTORY_LOCATION_LABEL",storageLocationId:location.id,storageLocationName:location.name}))} onClose={()=>setScannerOpen(false)}/>}
    {locationQr&&<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><section className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl"><div id="location-print-label"><p className="text-xs font-black tracking-widest text-emerald-700">STORAGE LOCATION</p><h2 className="mt-1 text-2xl font-black">{locationQr.name}</h2><img src={locationQr.image} alt={`${locationQr.name}の保管場所QR`} className="mx-auto mt-3 w-56 max-w-full"/><p className="mt-2 text-xs font-bold text-slate-500">保管場所ラベル</p></div><div className="mt-5 grid grid-cols-2 gap-2 print:hidden"><button onClick={()=>window.print()} className="rounded-xl bg-emerald-600 p-3 font-black text-white">印刷</button><button onClick={()=>setLocationQr(null)} className="rounded-xl bg-slate-200 p-3 font-black">閉じる</button></div></section></div>}
    <style jsx global>{`@media print { body * { visibility: hidden !important; } #location-print-label, #location-print-label * { visibility: visible !important; } #location-print-label { position: fixed; inset: 0 auto auto 0; width: 50mm; min-height: 50mm; padding: 3mm; color: #000; background: #fff; } #location-print-label img { width: 34mm; margin-top: 1mm; } @page { margin: 5mm; } }`}</style>
  </main>;
}

