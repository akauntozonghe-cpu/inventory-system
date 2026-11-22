"use client";
import ImeInput from "@/components/common/ImeInput";
import ActiveFilters from "@/components/common/ActiveFilters";
import Modal from "@/components/common/Modal";
import {nextClassification} from "@/lib/classification-change";
import type {CleanupAssessment} from "@/lib/classification-cleanup";
import {productScanIndex,normalizeScanCode,addProductSelection} from "@/lib/product-selection";
import Pagination from "@/components/common/Pagination";
import Link from "@/components/auth/PermissionLink";
import { CLASSIFICATION_WORKSPACE_KEY, classificationItemHref, classificationView, parseClassificationWorkspace } from "@/lib/classification-workspace";

import { parseScan } from "@/lib/scan-payload";
import { fetchFresh } from "@/lib/fetch-fresh";

import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LabelPrintPanel,{classificationPrintLabel,locationPrintLabel} from "@/components/LabelPrintPanel";
import LabelPrintDialog,{type PrintLabel} from "@/components/LabelPrintDialog";
import QrPreviewDialog from "@/components/QrPreviewDialog";
import FeedbackToast from "@/components/common/FeedbackToast";
import UnifiedScanner from "@/components/stocktake/UnifiedScanner";

type Classification = { id: string; kind: "MAJOR" | "MINOR"; name: string; parentName: string; labelCode?: string; itemCount: number; inventoryCount: number; archivedItemCount?: number };
type Location = { id: string; name: string; description: string | null; _count: { inventories: number; itemRegistrationRequests: number } };
type ItemRow = { managementCode?:string|null; inventoryInstances?:Array<{id:string;storageLocationId:string|null;quantity:number}>; id: string; name: string; janCode: string | null; systemBarcode: string | null; majorCategory: string | null; minorCategory: string | null; inventoryCount: number; quantityLabel?:string; totalQuantity: number };
type Payload = { classifications: Classification[]; locations: Location[]; items: ItemRow[] };



function normalizePayload(value: unknown): Payload {
  const source = value && typeof value === "object" ? value as Partial<Payload> : {};
  return {
    classifications: Array.isArray(source.classifications) ? source.classifications : [],
    locations: Array.isArray(source.locations) ? source.locations : [],
    items: Array.isArray(source.items) ? source.items : [],
  };
}

function CategoryUsage({row}:{row:Classification}) {
  return <div className="mt-1 text-xs leading-5 text-slate-600">
    <p><strong className="text-slate-800">分類を設定した商品 {row.itemCount}件</strong> ／ 商品に紐づく在庫明細 {row.inventoryCount}件</p>
    {(row.archivedItemCount??0)>0 && <p>削除済み商品を含む：{row.archivedItemCount}件</p>}
    {row.inventoryCount===0&&row.itemCount>0 && <p className="font-semibold text-amber-800">
      在庫明細は0件でも、商品{row.itemCount}件にはこの分類が残っています
    </p>}
  </div>;
}

export default function ClassificationsPage() {
  const [page, setPage] = useState(1);
  const [view,setView]=useState("ITEMS");
  useEffect(()=>{const open=()=>{if(window.location.hash==="#label-print")setView("PRINT");};open();window.addEventListener("hashchange",open);return()=>window.removeEventListener("hashchange",open);},[]);
  const loadSequence = useRef(0);
  const [masterSearch, setMasterSearch] = useState("");
  const [data, setData] = useState<Payload>({ classifications: [], locations: [], items: [] });
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [majorName, setMajorName] = useState(""); const [minorName, setMinorName] = useState(""); const [minorParent, setMinorParent] = useState("");
  const [locationName, setLocationName] = useState(""); const [locationDescription, setLocationDescription] = useState("");
  const [edit, setEdit] = useState<{ type: "MAJOR" | "MINOR" | "LOCATION"; source: string; sourceId?: string; parentName?: string } | null>(null);
  const [target, setTarget] = useState(""); const [targetParent, setTargetParent] = useState("");
  const [editReason,setEditReason]=useState("");
  const [cleanup,setCleanup]=useState<{
    assessment:CleanupAssessment;body:Record<string,unknown>;
  }|null>(null);
  const [cleanupName,setCleanupName]=useState("");
  const [cleanupReason,setCleanupReason]=useState("");
  const [cleanupLoading,setCleanupLoading]=useState(false);

  const [itemSearch, setItemSearch] = useState(""); const [itemMajorFilter, setItemMajorFilter] = useState("ALL");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]); const [assignMajor, setAssignMajor] = useState(""); const [assignMinor, setAssignMinor] = useState("");
  const [scannerOpen, setScannerOpen] = useState<"single"|"continuous"|null>(null);
  const [itemMinorFilter,setItemMinorFilter]=useState("");
  const [itemLocationFilter,setItemLocationFilter]=useState("");
  const [selectedOnly,setSelectedOnly]=useState(false);
  const [candidates,setCandidates]=useState<ItemRow[]>([]);
  const [scanNotice,setScanNotice]=useState("");
  const [changeMode,setChangeMode]=useState("MAJOR_ONLY");
  const [review,setReview]=useState<(Record<string,unknown>&Parameters<typeof nextClassification>[1]&{rows:ItemRow[]})|null>(null);
  const openReview=(body:Record<string,unknown>)=>{setError("");const ids=body.itemIds as string[];const rows=data.items.filter(item=>ids.includes(item.id)).map(item=>({...item}));setReview({...body,rows,expectedClassifications:rows.map(({id,majorCategory,minorCategory})=>({id,majorCategory,minorCategory}))});};
  const selectionRef=useRef<string[]>([]);
  const [workspaceRestored,setWorkspaceRestored]=useState(false);
  useEffect(()=>{
    try{
      const previous=parseClassificationWorkspace(sessionStorage.getItem(CLASSIFICATION_WORKSPACE_KEY));
      if(previous){
        setItemSearch(previous.itemSearch);
        setMasterSearch(previous.masterSearch);
        setItemMajorFilter(previous.majorFilter);
        setItemMinorFilter(previous.minorFilter);
        setItemLocationFilter(previous.locationFilter);
        setSelectedOnly(previous.selectedOnly);
        selectionRef.current=previous.selectedIds;
        setSelectedItemIds(previous.selectedIds);
        setPage(previous.page);
      }
      // A deep link selects its requested tab; otherwise reopen the last
      // workspace instead of restarting at the default tab.
      const tab=classificationView(new URLSearchParams(window.location.search).get("view"));
      const fromHash=window.location.hash==="#label-print"?"PRINT":null;
      setView(tab??fromHash??previous?.view??"ITEMS");
    }catch{ /* storage may be unavailable in private or restricted mode */ }
    setWorkspaceRestored(true);
  },[]);
  useEffect(()=>{
    if(!workspaceRestored)return;
    try{
      sessionStorage.setItem(CLASSIFICATION_WORKSPACE_KEY,JSON.stringify({
        view,itemSearch,masterSearch,majorFilter:itemMajorFilter,
        minorFilter:itemMinorFilter,locationFilter:itemLocationFilter,
        selectedOnly,selectedIds:selectedItemIds,page,
      }));
    }catch{ /* operating without persistence is still safe */ }
  },[workspaceRestored,view,itemSearch,masterSearch,itemMajorFilter,itemMinorFilter,itemLocationFilter,selectedOnly,selectedItemIds,page]);

  const index=useMemo(()=>productScanIndex(data.items),[data.items]);
  // Selecting existing products is not an unsaved edit. Confirmation is required only when committing an actual change.
  const missingSelected=useMemo(()=>{const ids=new Set(data.items.map(item=>item.id));return selectedItemIds.filter(id=>!ids.has(id));},[data.items,selectedItemIds]);
  const selectedSet=useMemo(()=>new Set(selectedItemIds),[selectedItemIds]);
  const updateSelection=(ids:string[])=>{selectionRef.current=ids;setSelectedItemIds(ids);};
  const addSelection=(items:ItemRow[])=>{const before=selectionRef.current;const next=addProductSelection(before,items.map(item=>item.id));updateSelection(next);setScanNotice(next.length===before.length?"選択済みです（重複追加はしません）。":items.map(item=>item.name).join("、")+"を追加しました。");};
  const scrollItems=()=>requestAnimationFrame(()=>document.getElementById("classification-items")?.scrollIntoView({behavior:"smooth",block:"start"}));
  const [singlePrint,setSinglePrint]=useState<PrintLabel[]|null>(null);
  const [qrPreview,setQrPreview]=useState<PrintLabel|null>(null);

  const load = useCallback(async () => { const sequence = ++loadSequence.current; const response = await fetchFresh("/api/admin/classifications"); const payload: unknown = await response.json().catch(() => null); if (!response.ok) { const message = payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string" ? payload.message : "分類を取得できませんでした。"; throw new Error(message); } if (sequence === loadSequence.current) setData(normalizePayload(payload)); }, []);
  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : "分類を取得できませんでした。")); }, [load]);
  const majors = useMemo(() => data.classifications.filter((row) => row.kind === "MAJOR"), [data.classifications]);
  const minors = useMemo(() => data.classifications.filter((row) => row.kind === "MINOR"), [data.classifications]);
  const liveFailed = useLiveRefresh(load);
  const matchesMaster = (name: string) => name.normalize("NFKC").toLocaleLowerCase("ja").includes(masterSearch.normalize("NFKC").trim().toLocaleLowerCase("ja"));
  const visibleItems = useMemo(() => { const query = itemSearch.normalize("NFKC").trim().toLocaleLowerCase("ja"); return data.items.filter((item) => (!selectedOnly||selectedSet.has(item.id))&&(!itemMinorFilter||item.minorCategory===itemMinorFilter)&&(!itemLocationFilter||item.inventoryInstances?.some(row=>row.storageLocationId===itemLocationFilter))&&(itemMajorFilter === "ALL" || (itemMajorFilter === "NONE" ? !item.majorCategory : item.majorCategory === itemMajorFilter)) && (!query || [item.name,item.janCode,item.systemBarcode,item.majorCategory,item.minorCategory].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase("ja").includes(query))); }, [data.items, itemMajorFilter, itemSearch,itemMinorFilter,itemLocationFilter,selectedOnly,selectedSet]);
  const pages = Math.max(1, Math.ceil(visibleItems.length / 100));
  const currentPage = Math.min(page, pages);
  const pageRows = visibleItems.slice((currentPage-1)*100, currentPage*100);
  const assignableMinors = useMemo(() => minors.filter((row) => row.parentName === assignMajor), [assignMajor, minors]);

  const reviewCleanup=async(body:Record<string,unknown>)=>{
    setCleanupLoading(true);setError("");setCleanup(null);
    try{
      const response=await fetch("/api/admin/classifications",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...body,action:body.kind?"PREVIEW_DELETE_CLASSIFICATION":"PREVIEW_DELETE_LOCATION"}),
      });
      const payload:unknown=await response.json().catch(()=>null);
      if(!response.ok||!payload||typeof payload!=="object"||!("assessment" in payload)){
        throw new Error(payload&&typeof payload==="object"&&"message" in payload&&typeof payload.message==="string"?payload.message:"削除対象の状態を取得できませんでした。");
      }
      const assessment=(payload as {assessment:CleanupAssessment}).assessment;
      setCleanup({assessment,body});setCleanupName("");setCleanupReason("");
      setEdit(null);
    }catch(error){setError(error instanceof Error?error.message:"対象を確認できませんでした。");}
    finally{setCleanupLoading(false);}
  };
  const runEdit=()=>{
    if(!edit||!target.trim())return;
    const isMerge=edit.type==="LOCATION"
      ? !target.startsWith("new:")
      : edit.type==="MAJOR"
        ? majors.some(row=>row.name===target && row.name!==edit.source)
        : minors.some(row=>row.name===target && (row.parentName!==(edit.parentName??"") || row.name!==edit.source));
    if(isMerge){
      if(editReason.trim().length<2){
        setError("統合・廃止する理由を2文字以上で入力してください。");return;
      }
      const destination=edit.type==="LOCATION"
        ? data.locations.find(row=>row.id===target)?.name??target
        : edit.type==="MINOR" ? `${targetParent}／${target}` : target;
      if(!window.confirm(`「${edit.source}」を「${destination}」へ統合して廃止しますか？\n\n関連する在庫と棚卸への影響を確認してください。個別の在庫明細・履歴は削除しません。`))return;
    }
    if(edit.type==="LOCATION"){
      if(target.startsWith("new:")) void execute({action:"RENAME_LOCATION",sourceId:edit.sourceId,target:target.slice(4),reason:editReason.trim()});
      else void execute({action:"MERGE_LOCATION",sourceId:edit.sourceId,targetId:target,reason:editReason.trim()});
    }else{
      void execute({action:"RENAME_OR_MERGE_CLASSIFICATION",kind:edit.type,source:edit.source,
        target,parentName:edit.parentName,targetParent,reason:editReason.trim()});
    }
  };

  const deleteReviewed=async()=>{
    if(!cleanup||!(cleanup.assessment.canDelete||cleanup.assessment.canUnassignAndDelete)||cleanupName!==cleanup.assessment.name||cleanupReason.trim().length<2){
      setError("削除する名前と理由を確認してください。");return;
    }
    const body={...cleanup.body,
      action:cleanup.assessment.canUnassignAndDelete && !cleanup.assessment.canDelete
        ? "UNASSIGN_AND_DELETE_CLASSIFICATION"
        : cleanup.body.kind?"DELETE_CLASSIFICATION":"DELETE_LOCATION",
      expectedItems:cleanup.assessment.linkedItems?.map(item=>({id:item.id,updatedAt:item.updatedAt})),
      expectedId:cleanup.assessment.id,confirmName:cleanupName,reason:cleanupReason.trim()};
    const successful=await execute(body);
    if(successful)setCleanup(null);
    else {
      // The source may have gained new references after the preview.
      setCleanup(null);
    }
  };

  const execute = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try { const response = await fetch("/api/admin/classifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(`${payload.message ?? "更新できませんでした。"}${payload.code ? `（${payload.code}）` : ""}`); setNotice(payload.message); setEdit(null); setTarget(""); setTargetParent(""); updateSelection([]); setSelectedOnly(false);setReview(null);setAssignMajor("");setAssignMinor("");setMajorName("");setMinorName("");setMinorParent("");setLocationName("");setLocationDescription("");setItemSearch("");setItemMajorFilter("ALL");setItemMinorFilter("");setItemLocationFilter("");setCandidates([]);setScanNotice("");setChangeMode("MAJOR_ONLY");setMasterSearch("");setPage(1); try{await load();}catch{setError("CLASSIFICATION_REFRESH_FAILED：変更は保存済みですが、最新情報を取得できませんでした。再入力せず更新してください。");} return true; }
    catch (e) { setError(e instanceof Error ? e.message : "更新できませんでした。"); return false; } finally { setBusy(false); }
  };

  const handleScan = (raw: string):boolean => {
    setError("");setPage(1);setView("ITEMS");
    const scanned=parseScan(raw);
    if(scanned.type==="INVALID")throw new Error("SCAN_INVALID：商品・分類・保管場所のラベルを読み取ってください。");
    if(scanned.type==="CLASSIFICATION") {
      const row=data.classifications.find(candidate=>candidate.kind===(scanned.kind??"MAJOR")&&((scanned.code&&candidate.labelCode===scanned.code)||(candidate.name===scanned.name&&(candidate.kind==="MAJOR"||candidate.parentName===scanned.parentName))));
      if(!row)throw new Error("CLASSIFICATION_SCAN_NOT_FOUND：分類を読み直してから再度スキャンしてください。");
      setItemMajorFilter(row.kind==="MAJOR"?row.name:row.parentName);setItemMinorFilter(row.kind==="MINOR"?row.name:"");setItemLocationFilter("");setItemSearch("");setSelectedOnly(false);setNotice(row.name+"の商品を表示しました。選択済みの商品は保持しています。");scrollItems();return true;
    }
    if(scanned.type==="LOCATION") {
      const row=data.locations.find(candidate=>scanned.id?candidate.id===scanned.id:candidate.name===scanned.name);
      if(!row)throw new Error("LOCATION_SCAN_NOT_FOUND：保管場所を読み直してください。");
      setItemLocationFilter(row.id);setItemMajorFilter("ALL");setItemMinorFilter("");setItemSearch("");setSelectedOnly(false);setNotice("保管場所「"+row.name+"」の商品を表示しました。");scrollItems();return true;
    }
    const matches=index.get(normalizeScanCode(scanned.code??""))??[];
    if(!matches.length)throw new Error("ITEM_SCAN_NOT_FOUND：該当商品がありません。最新情報を読み直してから確認してください。");
    if(matches.length>1){setCandidates(matches);setScanNotice("同じコードの商品があります。追加する商品を選んでください。");return false;}
    addSelection(matches);setItemSearch("");setItemMajorFilter("ALL");setItemMinorFilter("");setItemLocationFilter("");setSelectedOnly(true);
    if(scannerOpen!=="continuous")scrollItems();return true;
  };
  const scanManually=async()=>{try{const {resolveScan}=await import("@/lib/resolve-scan");const raw=itemSearch;if(parseScan(raw).type==="ITEM"&&!index.has(normalizeScanCode(parseScan(raw).code??raw))&&!/^[{[]/.test(raw.trim())&&!/^\d{8,13}$/.test(normalizeScanCode(raw))){setPage(1);return;}const scan=await resolveScan(raw);handleScan(scan.type==="CLASSIFICATION"?JSON.stringify({type:"INVENTORY_CLASSIFICATION_LABEL",kind:scan.kind,majorCategory:scan.kind?scan.parentName:scan.name,minorCategory:scan.kind?scan.name:undefined,parentName:scan.parentName}):scan.type==="LOCATION"?JSON.stringify({type:"INVENTORY_LOCATION_LABEL",storageLocationId:scan.id}):raw);setItemSearch("");}catch(error){setError(error instanceof Error?error.message:"SCAN_FAILED：読み取れませんでした。");}};
  const chooseCandidate=(item:ItemRow)=>{try{addSelection([item]);setCandidates([]);setSelectedOnly(true);setItemSearch("");setItemMajorFilter("ALL");setItemMinorFilter("");setItemLocationFilter("");if(scannerOpen==="single")setScannerOpen(null);}catch(error){setError((error as Error).message);}};
  const showClassificationQr=(row:Classification)=>setQrPreview(classificationPrintLabel(row));
  const showLocationQr=(row:Location)=>setQrPreview(locationPrintLabel(row));

  return <main className="min-h-screen bg-slate-100 p-4 text-slate-950 sm:p-8">
    <FeedbackToast tone="error" title="分類編集エラー" message={error} onClose={() => setError("")} />
    <FeedbackToast tone="success" title="更新完了" message={notice} autoCloseMs={5000} onClose={() => setNotice("")} />
    <div className="mx-auto max-w-7xl"><header className="flex flex-wrap justify-between gap-4"><div><p className="text-sm font-black tracking-widest text-indigo-700">CLASSIFICATION CONTROL</p><h1 className="mt-1 text-3xl font-black">分類・保管場所の整理</h1><Link href="/admin" className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">管理センターへ戻る</Link><p className="mt-2 text-slate-600">追加、名称変更・統合、使用状況の確認、不要な分類・保管場所の削除を管理します。使用中は移動・統合してから廃止します。</p></div><div className="flex h-fit flex-wrap gap-2"><button onClick={()=>setScannerOpen("single")} className="rounded-xl bg-indigo-600 px-4 py-3 font-black text-white">JAN・QRで検索</button><button onClick={()=>{setScannerOpen("continuous");setCandidates([]);}} className="rounded-xl bg-teal-700 px-4 py-3 font-black text-white">JANを連続で選択</button></div></header>
      <nav aria-label="分類整理の作業" className="mt-4 grid grid-cols-3 gap-2">{[["ITEMS","商品を分類"],["MASTERS","分類・保管場所"],["PRINT","ラベル印刷"]].map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>setView(id)} className={`rounded-xl border px-2 py-3 text-sm font-bold ${view===id?"bg-slate-900 text-white":"bg-white"}`}>{label}</button>)}</nav>
      <section className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-bold text-indigo-950">QRで商品・分類・保管場所を呼び出します。JANの連続読取はスキャンした商品を選択に追加します。同じ商品は1回だけ選択し、同じJANの別商品は候補から確認します。分類の変更は「分類変更」を押すまで保存されません。</section>
      {liveFailed && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3">最新情報を確認できていません。通信が戻ると再取得します。</p>}<div hidden={view!=="MASTERS"}><details open className="mt-5 rounded-2xl border bg-white p-4"><summary className="cursor-pointer font-black">分類・保管場所の追加・編集・廃止・削除</summary><p className="mt-2 text-xs text-slate-600">「在庫明細数」は在庫数量とは異なります。分類を設定した商品が残っている場合、在庫明細が0件でも削除前に分類を解除する必要があります。削除済みの商品も商品マスタへの紐づきとして数えています。</p><ImeInput aria-label="分類・保管場所を検索" value={masterSearch} onChange={e=>setMasterSearch(e.target.value)} placeholder="分類名・保管場所名を検索" className="mt-5 w-full rounded-xl border bg-white p-3"/><section id="locations" className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">大分類</h2><div className="mt-4 flex gap-2"><ImeInput value={majorName} onChange={(e)=>setMajorName(e.target.value)} placeholder="追加する大分類" className="min-w-0 flex-1 rounded-xl border p-3"/><button disabled={busy||!majorName.trim()} onClick={()=>void execute({action:"CREATE_CLASSIFICATION",kind:"MAJOR",name:majorName}).then(ok=>{if(ok)setMajorName("");})} className="rounded-xl bg-indigo-600 px-4 font-black text-white disabled:opacity-40">追加</button></div><div className="mt-4 max-h-[500px] space-y-2 overflow-auto">{majors.filter(row=>matchesMaster(row.name)).map(row=><div key={row.id} className="rounded-xl border p-3"><div className="flex justify-between gap-2"><div><p className="font-black">{row.name}</p><CategoryUsage row={row}/></div><div className="ml-auto flex flex-wrap items-center justify-end gap-2"><button className="inline-flex h-11 items-center rounded-lg bg-indigo-50 px-3 font-bold" onClick={()=>void showClassificationQr(row)}>QR</button><button onClick={()=>{setEdit({type:"MAJOR",source:row.name});setTarget("");setEditReason("");}} className="inline-flex h-11 items-center rounded-lg bg-slate-100 px-3 font-bold">編集</button><button disabled={busy||cleanupLoading} onClick={()=>void reviewCleanup({kind:"MAJOR",source:row.name,parentName:""})} className="inline-flex h-11 items-center rounded-lg border border-red-200 bg-white px-3 text-sm font-bold text-red-700 disabled:opacity-40">削除・廃止</button></div></div></div>)}</div></div>
        <div className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">小分類</h2><div className="mt-4 grid gap-2"><select value={minorParent} onChange={(e)=>setMinorParent(e.target.value)} className="rounded-xl border p-3"><option value="">親の大分類</option>{majors.map(row=><option key={row.id}>{row.name}</option>)}</select><div className="flex gap-2"><ImeInput value={minorName} onChange={(e)=>setMinorName(e.target.value)} placeholder="追加する小分類" className="min-w-0 flex-1 rounded-xl border p-3"/><button disabled={busy||!minorName.trim()||!minorParent} onClick={()=>void execute({action:"CREATE_CLASSIFICATION",kind:"MINOR",name:minorName,parentName:minorParent}).then(ok=>{if(ok)setMinorName("");})} className="rounded-xl bg-cyan-600 px-4 font-black text-white disabled:opacity-40">追加</button></div></div><div className="mt-4 max-h-[500px] space-y-2 overflow-auto">{minors.filter(row=>matchesMaster(row.parentName+" "+row.name)).map(row=><div key={row.id} className="rounded-xl border p-3"><div className="flex justify-between gap-2"><div><p className="font-black">{row.name}</p><p className="text-xs text-slate-500">{row.parentName}</p><CategoryUsage row={row}/></div><div className="ml-auto flex flex-wrap items-center justify-end gap-2"><button className="inline-flex h-11 items-center rounded-lg bg-cyan-50 px-3 font-bold" onClick={()=>void showClassificationQr(row)}>QR</button><button onClick={()=>{setEdit({type:"MINOR",source:row.name,parentName:row.parentName});setTarget("");setTargetParent(row.parentName);setEditReason("");}} className="inline-flex h-11 items-center rounded-lg bg-slate-100 px-3 font-bold">編集</button><button disabled={busy||cleanupLoading} onClick={()=>void reviewCleanup({kind:"MINOR",source:row.name,parentName:row.parentName})} className="inline-flex h-11 items-center rounded-lg border border-red-200 bg-white px-3 text-sm font-bold text-red-700 disabled:opacity-40">削除・廃止</button></div></div></div>)}</div></div>
        <div className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">保管場所</h2><div className="mt-4 grid gap-2"><ImeInput value={locationName} onChange={(e)=>setLocationName(e.target.value)} placeholder="追加する保管場所" className="rounded-xl border p-3"/><ImeInput value={locationDescription} onChange={(e)=>setLocationDescription(e.target.value)} placeholder="説明" className="rounded-xl border p-3"/><button disabled={busy||!locationName.trim()} onClick={()=>void execute({action:"CREATE_LOCATION",name:locationName,description:locationDescription}).then(ok=>{if(ok){setLocationName("");setLocationDescription("");}})} className="rounded-xl bg-emerald-600 p-3 font-black text-white disabled:opacity-40">保管場所を追加</button></div><div className="mt-4 max-h-[500px] space-y-2 overflow-auto">{data.locations.filter(row=>matchesMaster(row.name)).map(row=><div key={row.id} className="rounded-xl border p-3"><div className="flex justify-between gap-2"><div><p className="font-black">{row.name}</p><p className="text-xs text-slate-500">在庫明細{row._count.inventories}件</p></div><div className="ml-auto flex flex-wrap items-center justify-end gap-2"><button onClick={()=>void showLocationQr(row)} className="inline-flex h-11 items-center rounded-lg bg-emerald-50 px-3 font-bold text-emerald-800">QR</button><button onClick={()=>{setEdit({type:"LOCATION",source:row.name,sourceId:row.id});setTarget("");setEditReason("");}} className="inline-flex h-11 items-center rounded-lg bg-slate-100 px-3 font-bold">編集</button><button disabled={busy||cleanupLoading} onClick={()=>void reviewCleanup({sourceId:row.id})} className="inline-flex h-11 items-center rounded-lg border border-red-200 bg-white px-3 text-sm font-bold text-red-700 disabled:opacity-40">削除・廃止</button></div></div></div>)}</div></div>
      </section></details></div>
      <div hidden={view!=="PRINT"}><LabelPrintPanel data={data} onRefresh={load}/></div>
      <section hidden={view!=="ITEMS"} id="classification-items" className="mt-6 scroll-mt-24 rounded-3xl bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-black">商品の分類を一括変更</h2><p className="mt-1 text-sm font-semibold text-slate-600">商品を選び、分類への追加・変更・除外を一括実行します。一部の商品だけ新分類へ移すと分類を分割できます。</p><p className="mt-2 text-xs text-slate-600">商品名を押すと商品詳細を確認できます。「分類・保管場所の整理に戻る」で、選択と絞り込みを保ったまま戻れます。</p></div><div className="flex gap-2"><p className="rounded-xl bg-indigo-50 px-4 py-2 font-black text-indigo-800">選択 {selectedItemIds.length}件</p></div></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px]"><ImeInput value={itemSearch} onChange={(e)=>{setItemSearch(e.target.value);setPage(1);}} aria-label="商品名・JAN・QRを検索" type="search" onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing){event.preventDefault();void scanManually();}}} placeholder="商品名で検索／JAN・QRを入力してEnterで選択" className="rounded-xl border p-3"/><select aria-label="大分類で絞り込む" value={itemMajorFilter} onChange={(e)=>{setItemMajorFilter(e.target.value);setItemMinorFilter("");setPage(1);}} className="rounded-xl border p-3 font-bold"><option value="ALL">すべての大分類</option><option value="NONE">大分類未設定</option>{majors.map(row=><option key={row.id} value={row.name}>{row.name}</option>)}</select></div>
<div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="font-bold">小分類で絞り込む<select aria-label="小分類で絞り込む" value={itemMinorFilter?JSON.stringify([itemMajorFilter,itemMinorFilter]):""} onChange={event=>{if(event.target.value){const [parent,name]=JSON.parse(event.target.value);setItemMajorFilter(parent);setItemMinorFilter(name);}else setItemMinorFilter("");setPage(1);}} className="mt-1 w-full rounded-xl border p-3"><option value="">すべて</option>{minors.filter(row=>itemMajorFilter==="ALL"||row.parentName===itemMajorFilter).map(row=><option key={row.id} value={JSON.stringify([row.parentName,row.name])}>{row.parentName} ／ {row.name}</option>)}</select></label><label className="font-bold">保管場所で絞り込む<select aria-label="保管場所で絞り込む" value={itemLocationFilter} onChange={event=>{setItemLocationFilter(event.target.value);setPage(1);}} className="mt-1 w-full rounded-xl border p-3"><option value="">すべて</option>{data.locations.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div><p role="status" className="mt-2 text-sm">条件に合う商品 {visibleItems.length}件。絞り込みは選んだ時点で反映されます。分類の変更は確認後に保存します。</p>
        <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} className="rounded-xl border p-3" onClick={()=>void load().catch(()=>setError("CLASSIFICATION_REFRESH_FAILED：最新情報を取得できませんでした。"))}>最新情報を読み直す</button></div>
        <ActiveFilters filters={[{label:"大分類",value:itemMajorFilter==="ALL"?"":itemMajorFilter==="NONE"?"未設定":itemMajorFilter,remove:()=>{setItemMajorFilter("ALL");setItemMinorFilter("");}},{label:"小分類",value:itemMinorFilter,remove:()=>setItemMinorFilter("")},{label:"保管場所",value:data.locations.find(row=>row.id===itemLocationFilter)?.name??"",remove:()=>setItemLocationFilter("")},{label:"検索",value:itemSearch,remove:()=>setItemSearch("")},{label:"選択",value:selectedOnly?"選択済みだけ":"",remove:()=>setSelectedOnly(false)}]} onClear={()=>{setItemMajorFilter("ALL");setItemMinorFilter("");setItemLocationFilter("");setItemSearch("");setSelectedOnly(false);setPage(1);}}/>
        <div className="mt-3 flex flex-wrap items-center gap-2"><label><ImeInput type="checkbox" checked={selectedOnly} onChange={event=>{setSelectedOnly(event.target.checked);if(event.target.checked){setItemMajorFilter("ALL");setItemMinorFilter("");setItemLocationFilter("");setItemSearch("");}setPage(1);}}/> 選択済みだけ表示（{selectedItemIds.length}商品）</label></div>
        {candidates.length>0&&!scannerOpen&&<div role="group" aria-label="同じコードの候補" className="my-3 rounded-xl border p-3"><p>追加する商品を選んでください。</p>{candidates.map(item=><button key={item.id} className="m-2 rounded-xl border p-3" onClick={()=>chooseCandidate(item)}>{item.name} ／ {item.majorCategory??"分類未設定"} ／ {item.minorCategory??""}</button>)}<button className="underline" onClick={()=>setCandidates([])}>閉じる</button></div>}
        <p role="status" className="mt-2 text-sm">{scanNotice}</p>{missingSelected.length>0&&<p role="alert" className="my-3 rounded-xl bg-amber-50 p-3">現在の一覧にない選択が{missingSelected.length}件あります。廃止・削除や取得状態を確認してください。<button className="ml-2 underline" onClick={()=>updateSelection(selectionRef.current.filter(id=>!missingSelected.includes(id)))}>一覧にない商品を選択から外す</button></p>}
        <div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>{try{addSelection(pageRows);}catch(error){setError((error as Error).message);}}} className="rounded-xl bg-slate-200 px-4 py-2 font-bold">このページを全選択</button><button onClick={()=>{updateSelection([]);setSelectedOnly(false);setCandidates([]);setScanNotice("");}} className="rounded-xl bg-slate-200 px-4 py-2 font-bold">選択解除</button></div>
        <Pagination page={currentPage} totalPages={pages} start={(currentPage-1)*100} end={Math.min(currentPage*100, visibleItems.length)} total={visibleItems.length} onPageChange={setPage} />
        {pageRows.length===0&&<p className="my-3 rounded-xl bg-slate-50 p-3">条件に合う商品がありません。選択済みの商品は、絞り込みを解除して確認できます。</p>}
        <div className="mt-3 max-h-[420px] overflow-auto rounded-2xl border"><table className="w-full min-w-[480px] text-left"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-3">選択</th><th className="p-3">商品</th><th className="p-3">現在の分類</th><th className="p-3">在庫</th></tr></thead><tbody>{pageRows.map(item=><tr key={item.id} className="border-t"><td className="p-3"><ImeInput type="checkbox" aria-label={item.name+"を選択"} checked={selectedSet.has(item.id)} onChange={(e)=>{try{if(e.target.checked)addSelection([item]);else updateSelection(selectionRef.current.filter(id=>id!==item.id));}catch(error){setError((error as Error).message);}}} className="h-5 w-5"/></td><td className="p-3"><Link href={classificationItemHref(item.id)} className="inline-block max-w-[320px] break-words font-black text-blue-800 underline-offset-2 hover:underline">{
  item.name
}</Link><p className="text-xs text-slate-500">{item.janCode||item.systemBarcode||"コードなし"}</p></td><td className="p-3 font-bold">{item.majorCategory||"未設定"} ／ {item.minorCategory||"未設定"}</td><td className="p-3">{item.quantityLabel??item.totalQuantity}（明細{item.inventoryCount}件）</td></tr>)}</tbody></table></div>
        <label className="mt-4 block font-bold">変更する範囲<select aria-label="変更する範囲" className="ml-2 rounded-xl border p-3" value={changeMode} onChange={event=>setChangeMode(event.target.value)}><option value="MAJOR_ONLY">大分類だけ変更（小分類名を引き継ぐ）</option><option value="BOTH">大分類・小分類を変更</option></select></label>
        <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 lg:grid-cols-[1fr_1fr_auto]"><select value={assignMajor} onChange={(e)=>{setAssignMajor(e.target.value);setAssignMinor("");}} className="rounded-xl border p-3 font-bold"><option value="">変更先の大分類</option>{majors.map(row=><option key={row.id} value={row.name}>{row.name}</option>)}</select><select value={assignMinor} onChange={(e)=>setAssignMinor(e.target.value)} disabled={!assignMajor||changeMode==="MAJOR_ONLY"} className="rounded-xl border p-3 font-bold disabled:opacity-50"><option value="">{changeMode==="MAJOR_ONLY"?"各商品の小分類名を引き継ぐ":"小分類なし"}</option>{assignableMinors.map(row=><option key={row.id} value={row.name}>{row.name}</option>)}</select><button disabled={busy||missingSelected.length>0||selectedItemIds.length===0||!assignMajor} onClick={()=>openReview({action:"ASSIGN_ITEMS",itemIds:[...selectedItemIds],majorCategory:assignMajor,...(changeMode==="MAJOR_ONLY"?{keepMinorCategory:true}:{minorCategory:assignMinor||null})})} className="rounded-xl bg-indigo-700 px-5 py-3 font-black text-white disabled:opacity-40">選択商品を分類変更</button></div>
        <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy||missingSelected.length>0||selectedItemIds.length===0} onClick={()=>openReview({action:"ASSIGN_ITEMS",itemIds:[...selectedItemIds],minorCategory:null})} className="rounded-xl bg-amber-500 px-4 py-3 font-black">小分類から除外</button><button disabled={busy||missingSelected.length>0||selectedItemIds.length===0} onClick={()=>openReview({action:"ASSIGN_ITEMS",itemIds:[...selectedItemIds],majorCategory:null,minorCategory:null})} className="rounded-xl bg-red-600 px-4 py-3 font-black text-white">すべての分類から除外</button></div>
      </section>
    </div>
    {review&&<Modal titleId="classification-review" busy={busy} onClose={()=>setReview(null)}><h2 id="classification-review" className="text-xl font-black">変更前 → 変更後を確認</h2>{error&&<p role="alert" className="my-2 text-red-700">{error}</p>}<p className="my-3">選択した商品と関連在庫へ一括反映します。既存の分類自体の統合は「分類・保管場所の追加・名称変更・QR印刷」から行えます。</p><div className="max-h-80 space-y-2 overflow-auto">{review.rows.map(item=>{const next=nextClassification(item,review);return <p key={item.id} className="rounded-xl bg-slate-50 p-3"><strong>{item.name}</strong><br/>{item.majorCategory??"未設定"} ／ {item.minorCategory??"なし"} → <strong>{next.majorCategory??"未設定"} ／ {next.minorCategory??"なし"}</strong></p>;})}</div><div className="mt-4 flex gap-3"><button disabled={busy} className="rounded-xl bg-indigo-700 p-3 font-bold text-white" onClick={()=>void execute({...review,rows:undefined})}>この内容で一括変更</button><button disabled={busy} className="rounded-xl border p-3" onClick={()=>setReview(null)}>戻って修正</button></div></Modal>}
    {cleanup&&<Modal titleId="classification-delete-review" busy={busy||cleanupLoading} onClose={()=>setCleanup(null)}>
      <h2 id="classification-delete-review" className="text-xl font-black text-slate-950">分類・保管場所の削除確認</h2>
      <p className="mt-2 rounded-xl bg-slate-100 p-3 font-black">
        {cleanup.assessment.kind==="LOCATION"?"保管場所":cleanup.assessment.kind==="MAJOR"?"大分類":"小分類"}：
        {cleanup.assessment.name}
      </p>
      <p className="mt-3 text-sm text-slate-700">削除前に商品・在庫・登録申請・棚卸との紐づきを検査しました。使用中の項目は統合して廃止するか、利用先を移動してから削除します。</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {([
          ["商品",cleanup.assessment.counts.items],
          ["在庫明細",cleanup.assessment.counts.stocks],
          ["登録申請",cleanup.assessment.counts.registrationRequests],
          ["進行中の棚卸",cleanup.assessment.counts.activeStocktakes],
          ["子分類",cleanup.assessment.counts.childCategories],
          ["現在庫がある明細",cleanup.assessment.counts.positiveStockRows??0],
          ["削除済み商品",cleanup.assessment.counts.archivedItems??0],
        ] as const).map(([name,count])=><div key={name} className="rounded-lg bg-slate-50 p-3">
          <dt className="text-slate-600">{name}</dt><dd className="mt-1 font-black">{count}件</dd>
        </div>)}
      </dl>
      {cleanup.assessment.kind!=="LOCATION" && cleanup.assessment.counts.items>0 && <>
        <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm font-bold text-blue-900">
          「商品{cleanup.assessment.counts.items}件」は在庫数量ではなく、この分類が設定された商品マスタの件数です。
          在庫数量が0でも商品が登録されている限り、通常の「分類だけ削除」はできません。
          {cleanup.assessment.counts.positiveStockRows===0
            ? " 現在庫がある在庫明細は検出されていません。"
            : ` 現在庫が残る在庫明細が${cleanup.assessment.counts.positiveStockRows}件あります。`}
        </p>
        <details className="mt-2 rounded-lg border border-slate-200">
          <summary className="cursor-pointer p-3 text-sm font-bold">紐づいている商品を確認（{cleanup.assessment.counts.items}件）</summary>
          <div className="max-h-48 overflow-y-auto border-t border-slate-200 p-2">
            {cleanup.assessment.linkedItems?.map(item=><p key={item.id} className="border-b border-slate-100 px-2 py-1 text-sm">{item.name}</p>)}
            {cleanup.assessment.counts.items>100&&<p className="text-sm text-amber-800">最初の100件のみ表示。対象を絞ってください。</p>}
          </div>
        </details>
      </>}
      {cleanup.assessment.canUnassignAndDelete&&!cleanup.assessment.canDelete&&
        <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-950">
          在庫を削除せずに整理できます。
          確認後、表示された商品の分類と、数量0の在庫に残る同じ分類を解除し、
          分類マスタを削除します。商品・数量・過去の棚卸・取引履歴は削除しません。
        </p>}
      {cleanup.assessment.reasons.length>0&&<section className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="font-black text-amber-900">{cleanup.assessment.canUnassignAndDelete?"分類だけの削除はできません（商品からの解除が必要）":"現在は削除できません"}</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-950">
          {cleanup.assessment.reasons.map(reason=><li key={reason}>{reason}</li>)}
        </ul>
        <p className="mt-2 text-sm">{cleanup.assessment.canUnassignAndDelete
          ? "この商品群は在庫数量0のため、下の「分類だけ解除して削除」から一括整理できます。"
          : "在庫がある、削除済み商品や申請・棚卸・子分類が紐づいている場合は、先に移動・統合などで整理してください。商品や履歴は削除しません。"}</p>
      </section>}
      <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{cleanup.assessment.warning}</p>
      {(cleanup.assessment.canDelete||cleanup.assessment.canUnassignAndDelete)&&<>
        <label className="mt-3 block text-sm font-bold">削除する項目名をそのまま入力
          <input value={cleanupName} onChange={event=>setCleanupName(event.target.value)}
            autoComplete="off" placeholder={cleanup.assessment.name}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 p-3"/>
        </label>
        <label className="mt-3 block text-sm font-bold">削除理由
          <textarea value={cleanupReason} onChange={event=>setCleanupReason(event.target.value)} rows={2} maxLength={500}
            placeholder="例：使用を終了したため" className="mt-1 w-full rounded-lg border border-slate-300 p-3"/>
        </label>
      </>}
      <div className="mt-4 flex flex-wrap gap-2">
        {(cleanup.assessment.canDelete||cleanup.assessment.canUnassignAndDelete)&&<button type="button" disabled={busy||cleanupName!==cleanup.assessment.name||cleanupReason.trim().length<2}
          className="min-h-11 rounded-xl bg-red-700 px-4 py-3 font-black text-white disabled:opacity-40"
          onClick={()=>void deleteReviewed()}>{cleanup.assessment.canUnassignAndDelete&&!cleanup.assessment.canDelete?"商品から分類を外して削除":"この項目を削除する"}</button>}
        <button type="button" onClick={()=>setCleanup(null)} className="min-h-11 rounded-xl border px-4 py-3 font-bold">
          {(cleanup.assessment.canDelete||cleanup.assessment.canUnassignAndDelete)?"キャンセル":"閉じる・整理に戻る"}
        </button>
      </div>
    </Modal>}
    {edit&&<div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4"><section className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:p-6"><p className="text-sm font-black text-indigo-700">変更元</p><h2 className="mt-1 text-2xl font-black">{edit.source}</h2><p className="mt-2 text-sm text-slate-600">名称変更は新しい名前を入力します。既存名を指定すると統合になります。在庫・棚卸範囲・履歴の参照も更新されます。</p>{edit.type==="LOCATION"?<select value={target} onChange={(e)=>setTarget(e.target.value)} className="mt-5 w-full rounded-xl border p-3"><option value="">統合先を選択（新名称なら下へ入力）</option>{data.locations.filter(row=>row.id!==edit.sourceId).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>:<ImeInput value={target} onChange={(e)=>setTarget(e.target.value)} placeholder="変更・統合先の分類名" className="mt-5 w-full rounded-xl border p-3"/>}{edit.type==="MINOR"&&<select value={targetParent} onChange={(e)=>setTargetParent(e.target.value)} className="mt-3 w-full rounded-xl border p-3">{majors.map(row=><option key={row.id}>{row.name}</option>)}</select>}{edit.type==="LOCATION"&&<ImeInput value={target.startsWith("new:")?target.slice(4):""} onChange={(e)=>setTarget(`new:${e.target.value}`)} placeholder="または新しい保管場所名" className="mt-3 w-full rounded-xl border p-3"/>}<label className="mt-3 block text-sm font-bold">変更・統合の理由（統合時は必須）<ImeInput value={editReason} onChange={event=>setEditReason(event.target.value)} placeholder="例：使わなくなった保管場所を統合" className="mt-1 w-full rounded-xl border p-3"/></label><p className="my-3 rounded-xl bg-indigo-50 p-3">変更前：{edit.parentName?edit.parentName+" ／ ":""}{edit.source}<br/>変更後：{edit.type==="MINOR"?targetParent+" ／ ":""}{edit.type==="LOCATION"?(target.startsWith("new:")?target.slice(4):data.locations.find(row=>row.id===target)?.name)||"未選択":target||"未選択"}</p><div className="mt-5 grid gap-2 sm:grid-cols-3"><button disabled={busy||!target} onClick={runEdit} className="rounded-xl bg-indigo-600 p-3 font-black text-white disabled:opacity-40">{edit.type==="LOCATION"&&!target.startsWith("new:")?"統合して廃止":"名称変更・統合"}</button><button disabled={busy} onClick={()=>void reviewCleanup(edit.type==="LOCATION"?{sourceId:edit.sourceId}:{kind:edit.type,source:edit.source,parentName:edit.parentName})} className="rounded-xl border border-red-300 bg-red-50 p-3 font-black text-red-800">削除前に確認</button><button onClick={()=>setEdit(null)} className="rounded-xl bg-slate-200 p-3 font-black">戻る</button></div></section></div>}
    {scannerOpen&&<UnifiedScanner continuous={scannerOpen==="continuous"} pauseMessage="同じコードの候補を確認してください。選ぶと読取を再開します。" paused={candidates.length>0} title={scannerOpen==="continuous"?"JANを連続で選択":"商品・分類・保管場所QRを読む"} notice="選択を積み上げます。同じ商品を繰り返し読んでも重複しません。選択は読取終了後に確認できます。" onProduct={code=>handleScan(code)} onCategory={name=>{handleScan("CATEGORY:"+encodeURIComponent(name));}} onMinorCategory={(name,parentName)=>{handleScan(JSON.stringify({kind:"MINOR",minorCategory:name,parentName}));}} onLocation={location=>{handleScan(JSON.stringify({type:"INVENTORY_LOCATION_LABEL",storageLocationId:location.id}));}} onClose={()=>{setScannerOpen(null);setCandidates([]);}}>
      <section className="rounded-xl bg-white p-4 text-slate-950"><p className="text-xl font-black">選択 {selectedItemIds.length}商品</p><p role="status" className="mt-2">{scanNotice}</p>{candidates.map(item=><button key={item.id} className="my-2 block w-full rounded-xl border p-3 text-left font-bold" onClick={()=>chooseCandidate(item)}>{item.name} ／ {item.majorCategory??"分類未設定"} ／ {item.minorCategory??""}</button>)}{candidates.length>0&&<button className="rounded-xl border p-3" onClick={()=>setCandidates([])}>この読取をスキップ</button>}<button className="mt-3 rounded-xl bg-teal-700 p-3 font-bold text-white" onClick={()=>{setScannerOpen(null);setCandidates([]);setSelectedOnly(true);setItemMajorFilter("ALL");setItemMinorFilter("");setItemLocationFilter("");setItemSearch("");setPage(1);scrollItems();}}>読取を終えて選択を確認</button></section>
    </UnifiedScanner>}
    {qrPreview&&<QrPreviewDialog label={qrPreview} onClose={()=>setQrPreview(null)} onPrint={()=>{setSinglePrint([qrPreview]);setQrPreview(null);}}/>}
    {singlePrint&&<LabelPrintDialog labels={singlePrint} onClose={()=>setSinglePrint(null)}/>}
  </main>;
}
