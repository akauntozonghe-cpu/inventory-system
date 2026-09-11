"use client";
import { marketplaceTakeHome } from "@/lib/marketplace-settings";
import SellingAssistant from "@/components/marketplace/SellingAssistant";
import {resolveScan} from "@/lib/resolve-scan";
import ProductIdentity from "@/components/inventory/ProductIdentity";
import ActiveFilters from "@/components/common/ActiveFilters";
import UnifiedScanner from "@/components/stocktake/UnifiedScanner";
import { useAdminMode } from "@/components/auth/PageAdminMode";
import Pagination from "@/components/common/Pagination";


import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { fetchFresh } from "@/lib/fetch-fresh";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FeedbackToast from "@/components/common/FeedbackToast";
import { recoverAfterFailure } from "@/lib/client-error-recovery";

type Inventory = { id: string; lotNo?: string | null; unit?: string | null; quantity: number; storageAvailable: number; acquisitionCost: number | null; item: { id: string; name: string; majorCategory: string | null; janCode?: string | null; systemBarcode?: string | null; managementCode?: string | null }; storageLocation: { name: string } | null };
type Listing = { id: string; shippingOriginPrefecture: string | null; shippingDueAt: string | null; inventoryInstanceId: string; channel: string; title: string; description: string | null; category: string | null; itemCondition: string | null; listingUrl: string | null; price: number; listedQuantity: number; soldQuantity: number; fee: number | null; shippingCost: number | null; packagingCost: number | null; acquisitionCostSnapshot: number | null; shippingMethod: string | null; shippingStatus: string; trackingNumber: string | null; status: string; notes: string | null; updatedAt: string; inventoryInstance: Inventory };
type Payload = { listings: Listing[]; inventories: Inventory[]; channels?: {channel:string;feeRateBps:number}[]; summary?: { preparing: number; listed: number; shipping: number; settledProfit: number } };
type ErrorState = { message: string; code: string; reportId: string | null; status: "RECOVERING" | "ADMIN_REQUIRED" };

const channelLabels: Record<string, string> = { mercari: "メルカリ", rakuma: "ラクマ", yahoo_furima: "Yahoo!フリマ", flea_market: "その他" };
const statusLabels: Record<string, string> = { DRAFT: "出品準備", READY: "出品待ち", LISTED: "出品中", SOLD: "売却済み", CANCELLED: "停止・取下げ" };
const shippingLabels: Record<string, string> = { NOT_READY: "未準備", PACKING: "梱包中", READY_TO_SHIP: "発送待ち", SHIPPED: "発送済み", DELIVERED: "配達済み", SETTLED: "取引完了" };

function messageOf(value: unknown, fallback: string) {
  return value && typeof value === "object" && "message" in value && typeof value.message === "string" ? value.message : fallback;
}

function codeOf(value: unknown, fallback: string) {
  return value && typeof value === "object" && "code" in value && typeof value.code === "string" ? value.code : fallback;
}

class MarketplaceRequestError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

export default function SharedMarketplacePage() {
  const admin = useAdminMode();
  const [preparing,setPreparing]=useState(false);
  const [linkedTarget,setLinkedTarget]=useState<{itemId?:string;inventoryId?:string;listingId?:string}>({});
  const [scannerOpen,setScannerOpen] = useState(false);
  const [inventoryQuery,setInventoryQuery] = useState("");
  const [debouncedQuery,setDebouncedQuery] = useState("");
  useEffect(()=>{const timer=setTimeout(()=>setDebouncedQuery(inventoryQuery),250);return()=>clearTimeout(timer);},[inventoryQuery]);
  const [categoryFilter,setCategoryFilter] = useState("");
  const [locationFilter,setLocationFilter] = useState("");
  const [adminPanel,setAdminPanel] = useState(false);
  const [reversal,setReversal] = useState<Listing|null>(null);
  const [reason,setReason] = useState("");
  const [stockConfirmed,setStockConfirmed] = useState(false);
  const [targetStatus,setTargetStatus] = useState("DRAFT");
  useEffect(()=>{const show=()=>setAdminPanel(true);window.addEventListener("inventory:marketplace-admin",show);return()=>window.removeEventListener("inventory:marketplace-admin",show);},[]);
  const [page, setPage] = useState(1);
  const [listSearch, setListSearch] = useState("");
  const [listStatus, setListStatus] = useState("ACTIVE");
  useEffect(()=>{const params=new URLSearchParams(location.search);if(params.get("itemId")||params.get("inventoryId")||params.get("listingId")){setLinkedTarget({listingId:params.get("listingId")??undefined,itemId:params.get("itemId")??undefined,inventoryId:params.get("inventoryId")??undefined});setListStatus("ALL");}},[]);
  const refreshSequence = useRef(0);
  const [data, setData] = useState<Payload>({ listings: [], inventories: [] });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState<ErrorState | null>(null);
  const [notice, setNotice] = useState("");
  const [inventoryId, setInventoryId] = useState("");
  const [channel, setChannel] = useState("mercari");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [shippingMethod, setShippingMethod] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [packagingCost,setPackagingCost]=useState("");
  const inventoryChoices = useMemo(()=>data.inventories.filter(entry=>entry.storageAvailable>0 && (!categoryFilter || entry.item.majorCategory===categoryFilter) && (!locationFilter || entry.storageLocation?.name===locationFilter) && [entry.id,entry.item.id,entry.item.name,entry.item.janCode,entry.item.systemBarcode,entry.item.managementCode,entry.lotNo,entry.storageLocation?.name].filter(Boolean).join(" ").normalize("NFKC").toLowerCase().includes(inventoryQuery.normalize("NFKC").trim().toLowerCase())),[data.inventories,inventoryQuery,categoryFilter,locationFilter]);
  const searchCode=async()=>{try{const scan=await resolveScan(inventoryQuery);if(scan.type==="CLASSIFICATION"){setCategoryFilter(scan.kind?scan.parentName??"":scan.name??"");setInventoryQuery("");}else if(scan.type==="LOCATION"){setLocationFilter(scan.name??"");setInventoryQuery("");}else if(scan.type==="ITEM"){setInventoryQuery(scan.code??"");}setInventoryId("");}catch(error){setNotice(error instanceof Error?error.message:"SCAN_FAILED：コードを確認してください。");}};
  const selectedInventory = data.inventories.find((entry) => entry.id === inventoryId);

  const fetchMarketplace = useCallback(async () => {
    const response = await fetchFresh("/api/admin/marketplace/listings?"+new URLSearchParams({inventoryQuery:debouncedQuery,category:categoryFilter,location:locationFilter}), { cache: "no-store" });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new MarketplaceRequestError(messageOf(payload, "フリマ情報を取得できませんでした。"), codeOf(payload, "MARKETPLACE_LIST_FAILED"));
    return payload as Payload;
  }, [debouncedQuery,categoryFilter,locationFilter]);

  const load = useCallback(async (silent = false) => {
    const sequence = ++refreshSequence.current;
    if (!silent && !debouncedQuery && !categoryFilter && !locationFilter) setLoading(true);
    try {
      const next = await fetchMarketplace();
      if (sequence !== refreshSequence.current) return;
      setData(next);
      setError(null);
    } catch (caught) {
      if (sequence !== refreshSequence.current) return;
      const code = caught instanceof MarketplaceRequestError ? caught.code : "MARKETPLACE_LIST_FAILED";
      const message = caught instanceof Error ? caught.message : "フリマ情報を取得できませんでした。";
      setError({ message, code, reportId: null, status: "RECOVERING" });
      const recovered = await recoverAfterFailure({ code, title: "フリマ情報取得エラー", message, route: "/marketplace", detail: { operation: "LIST" }, action: fetchMarketplace });
      if (sequence !== refreshSequence.current) return;
      if (recovered.success && recovered.value) {
        setData(recovered.value);
        setError(null);
        setNotice("自動復旧してフリマ情報を再取得しました。");
      } else {
        setError({ message, code, reportId: recovered.reportId, status: "ADMIN_REQUIRED" });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fetchMarketplace,debouncedQuery,categoryFilter,locationFilter]);

  useEffect(() => { void load(); }, [load]);
  const liveFailed = useLiveRefresh(async () => {
    const sequence = ++refreshSequence.current;
    const next = await fetchMarketplace();
    if (sequence === refreshSequence.current) setData(next);
  });
useEffect(() => {
    if (!selectedInventory) return;
    setTitle((current) => current || selectedInventory.item.name);
  }, [selectedInventory]);

  const visibleListings = useMemo(() => data.listings.filter(row => (!linkedTarget.listingId||row.id===linkedTarget.listingId)&&(!linkedTarget.itemId||row.inventoryInstance.item.id===linkedTarget.itemId)&&(!linkedTarget.inventoryId||row.inventoryInstanceId===linkedTarget.inventoryId)&&(listStatus === "ALL" || (listStatus === "ACTIVE" ? row.status !== "CANCELLED" && row.shippingStatus !== "SETTLED" : row.status === listStatus)) && ([row.title,row.inventoryInstance.item.name,row.inventoryInstance.item.janCode,row.inventoryInstance.item.managementCode].join(" ")).normalize("NFKC").toLowerCase().includes(listSearch.normalize("NFKC").trim().toLowerCase())), [data.listings, listStatus, listSearch,linkedTarget]);
  const pages = Math.max(1, Math.ceil(visibleListings.length / 30));
  const currentPage = Math.min(page, pages);
  const pageRows = visibleListings.slice((currentPage-1)*30, currentPage*30);
  const summary = data.summary ?? { preparing: 0, listed: 0, shipping: 0, settledProfit: 0 };
  const feeBps=data.channels?.find(row=>row.channel===channel)?.feeRateBps??(channel==="mercari"?1000:channel==="yahoo_furima"?500:null);
  const estimatedTakeHome = marketplaceTakeHome(Number(price), Number(quantity), feeBps, shippingCost === "" ? null : Number(shippingCost), packagingCost === "" ? null : Number(packagingCost));
  const estimatedProfit = price && shippingCost!=="" && packagingCost!=="" && selectedInventory?.acquisitionCost!==null && selectedInventory?.acquisitionCost!==undefined && feeBps!==null ? Number(price)*Number(quantity)-Math.ceil(Number(price)*Number(quantity)*feeBps/10000)-Number(shippingCost)-Number(packagingCost)-selectedInventory.acquisitionCost*Number(quantity) : null;

  const createDraft = async () => {
    if (working) return;
    setWorking("create"); setError(null);
    try {
      const response = await fetchFresh("/api/admin/marketplace/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventoryInstanceId: inventoryId, channel, title, description, itemCondition: condition, price: Number(price), listedQuantity: Number(quantity), shippingMethod, shippingCost: shippingCost===""?null:Number(shippingCost), packagingCost:packagingCost===""?null:Number(packagingCost) }) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, "出品準備を作成できませんでした。"));
      setNotice(messageOf(payload, "出品準備へ追加しました。"));setPreparing(false);
      setInventoryId(""); setTitle(""); setDescription(""); setPrice("");setPackagingCost(""); setShippingCost("");setQuantity("1");setShippingMethod("");setChannel("mercari");setCondition("");setInventoryQuery("");setDebouncedQuery("");setCategoryFilter("");setLocationFilter("");
      try{await load(true);}catch{setNotice("出品準備は保存済みです。最新情報を取得できなかったため、再登録せず画面を更新してください。");}
    } catch (caught) { setError({ message: caught instanceof Error ? caught.message : "出品準備を作成できませんでした。", code: "MARKETPLACE_CREATE_FAILED", reportId: null, status: "ADMIN_REQUIRED" }); }
    finally { setWorking(""); }
  };

  const update = async (id: string, body: Record<string, unknown>) => {
    if (working) return;
    setWorking(id); setError(null);
    try {
      const response = await fetchFresh("/api/admin/marketplace/listings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, expectedUpdatedAt:data.listings.find(row=>row.id===id)?.updatedAt, ...body }) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, "更新できませんでした。"));
      setNotice(messageOf(payload, "更新しました。")); setReversal(null); await load(true);
    } catch (caught) { setError({ message: caught instanceof Error ? caught.message : "更新できませんでした。", code: "MARKETPLACE_UPDATE_FAILED", reportId: null, status: "ADMIN_REQUIRED" }); }
    finally { setWorking(""); }
  };

  const copyDraft = async (listing: Listing) => {
    const draft = `${listing.title}\n\n${listing.description ?? ""}\n\n状態：${listing.itemCondition ?? "-"}\n発送：${listing.shippingMethod ?? "未設定"}\n価格：${listing.price.toLocaleString("ja-JP")}円`;
    await navigator.clipboard.writeText(draft);
    setNotice("出品用のタイトル・説明・価格をコピーしました。");
  };

  if (loading) return <main className="min-h-screen bg-slate-50 p-8 text-center font-bold text-slate-600">
      {liveFailed && <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900">更新の確認が遅れています。通信が戻ると再取得します。</p>}フリマを準備しています…</main>;

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-950 sm:p-8">
      {(linkedTarget.itemId||linkedTarget.inventoryId||linkedTarget.listingId)&&<p className="mx-auto mb-3 max-w-7xl rounded-xl bg-violet-50 p-3 font-bold">{linkedTarget.listingId?"通知で指定された出品・販売履歴を表示中":"在庫検索から指定した商品の出品・販売履歴を表示中"}<button className="ml-3 underline" onClick={()=>setLinkedTarget({})}>絞り込みを解除</button></p>}
      <FeedbackToast tone="error" title="フリマエラー" message={error?.message ?? ""} errorCode={error?.code} reportId={error?.reportId} recoveryStatus={error?.status} onRetry={() => void load()} retrying={error?.status === "RECOVERING"} onClose={() => setError(null)} />
      <FeedbackToast tone="success" title="完了" message={notice} onClose={() => setNotice("")} />
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-black tracking-[0.2em] text-violet-700">SHARED MARKETPLACE</p><h1 className="mt-1 text-3xl font-black">フリマ</h1><p className="mt-2 text-slate-600">みんなで同じ在庫・出品・発送状況を共有。商品を選んで、提案を確認するところから。</p></div><div className="flex gap-2"><a href="/api/admin/marketplace/listings?format=csv" className="rounded-xl bg-emerald-600 px-4 py-3 font-black text-white">取引CSV</a></div></header><details aria-label="フリマの進め方" className="mt-5 rounded-2xl border bg-white p-4"><summary className="cursor-pointer font-bold">はじめて使う方へ：出品から発送まで</summary><ol className="mt-2 grid gap-2 text-sm sm:grid-cols-4"><li>1. JAN・QR・商品名で在庫を選ぶ</li><li>2. 価格・送料の候補を確認して準備</li><li>3. 出品文を販売サイトに登録し「出品済み」にする</li><li>4. 売れたら販売を記録 → 在庫を減算 → 発送を記録</li></ol><p className="mt-3 text-sm text-slate-600">保存だけでは外部サイトに出品されません。保存すると全員の画面に反映されます。</p></details>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["出品準備", summary.preparing], ["出品中", summary.listed], ["発送対応", summary.shipping], ["確定利益", `${summary.settledProfit.toLocaleString("ja-JP")}円`]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</section>

        <div className="flex rounded-2xl bg-slate-200/70 p-1" aria-label="フリマの作業"><button aria-pressed={!preparing} onClick={()=>setPreparing(false)} className={"min-h-12 flex-1 rounded-xl px-3 font-bold "+(!preparing?"bg-white shadow-sm":"text-slate-600")}>出品・発送</button><button aria-pressed={preparing} onClick={()=>setPreparing(true)} className={"min-h-12 flex-1 rounded-xl px-3 font-bold "+(preparing?"bg-white shadow-sm":"text-slate-600")}>出品を準備</button></div>
        {liveFailed && <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900">更新確認が遅れています。通信が戻ると再取得します。</p>}<div className={preparing?"hidden":"flex flex-wrap gap-3"}><input aria-label="出品を検索" value={listSearch} onChange={e=>{setListSearch(e.target.value);setPage(1);}} placeholder="商品名・出品名で検索" className="min-w-0 flex-1 rounded-xl border p-3"/><select aria-label="出品の状態" value={listStatus} onChange={e=>{setListStatus(e.target.value);setPage(1);}} className="rounded-xl border p-3"><option value="ACTIVE">対応中</option><option value="ALL">すべて</option>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><section className="space-y-5">
          <div className={preparing?"mx-auto max-w-2xl rounded-3xl bg-white p-5 shadow-sm sm:p-7":"hidden"}><h2 className="text-xl font-black">1. 出品する在庫を選ぶ</h2><button onClick={()=>setScannerOpen(true)} className="mt-3 w-full rounded-xl bg-slate-800 p-3 font-bold text-white">JAN・QRを読み取る</button><input aria-label="出品する在庫を検索" value={inventoryQuery} onChange={e=>{setInventoryQuery(e.target.value);setInventoryId("");}} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing){e.preventDefault();void searchCode();}}} placeholder="商品名・JANで検索／QRを入力してEnter" className="mt-3 w-full rounded-xl border p-3"/><ActiveFilters filters={[{label:"大分類",value:categoryFilter,remove:()=>{setCategoryFilter("");setInventoryId("");}},{label:"保管場所",value:locationFilter,remove:()=>{setLocationFilter("");setInventoryId("");}},{label:"検索",value:inventoryQuery,remove:()=>{setInventoryQuery("");setInventoryId("");}}]} onClear={()=>{setCategoryFilter("");setLocationFilter("");setInventoryQuery("");setInventoryId("");}}/><p className="my-2 text-sm">大分類QRはその分類、保管場所QRは棚・部屋などの場所から出品可能な在庫を探すために使います。両方読むと条件を組み合わせます。読み取るだけでは在庫を移動しません。</p><div className="mt-4 space-y-3">
            <p role="status" className="text-sm">候補 {inventoryChoices.length}件{inventoryChoices.length===0?"：条件を解除するか、出品に使える在庫があるか確認してください。":"（同じJANでも保管場所・Lotを確認）"}</p><select aria-label="出品する在庫" value={inventoryId} onChange={(event) => { setInventoryId(event.target.value); setTitle("");setDescription("");setPrice("");setShippingCost("");setShippingMethod("");setPackagingCost("");setQuantity("1");setCondition(""); }} className="w-full rounded-xl border p-3 font-bold"><option value="">在庫を選択（同じJANでもロットを確認）</option>{inventoryChoices.map((entry) => <option key={entry.id} value={entry.id}>{entry.item.name}（{entry.storageLocation?.name || "場所未設定"}・Lot {entry.lotNo || "なし"}・利用可 {entry.storageAvailable}）</option>)}</select>
            {selectedInventory&&<div className="rounded-xl bg-blue-50 p-3 text-sm"><p className="font-black">選択中：{selectedInventory.item.name}</p><ProductIdentity item={selectedInventory.item} inventoryId={selectedInventory.id}/><p>場所：{selectedInventory.storageLocation?.name||"未設定"} ／ Lot：{selectedInventory.lotNo||"なし"}</p><p>現在庫 {selectedInventory.quantity} ／ 出品に使える数 {selectedInventory.storageAvailable}</p><Link className="font-bold text-blue-700 underline" href={"/items/"+selectedInventory.item.id+"?inventoryId="+encodeURIComponent(selectedInventory.id)}>商品・在庫の詳細</Link></div>}<h3 className="font-black">2. 提案を見て出品内容を決める</h3><div className="grid grid-cols-3 gap-2">{Object.entries(channelLabels).slice(0, 3).map(([value, label]) => <button key={value} type="button" onClick={() => setChannel(value)} className={`rounded-xl px-2 py-3 text-sm font-black ${channel === value ? "bg-violet-700 text-white" : "bg-slate-100"}`}>{label}</button>)}</div>
            <label className="block text-sm font-bold">商品の状態<select aria-label="商品の状態" value={condition} onChange={event=>setCondition(event.target.value)} className="mt-1 w-full rounded-xl border p-3"><option value="">実物を確認して選ぶ</option>{["新品、未使用","未使用に近い","目立った傷や汚れなし","やや傷や汚れあり","傷や汚れあり","全体的に状態が悪い"].map(value=><option key={value}>{value}</option>)}</select></label>
            <label className="block text-sm font-bold">何点出品しますか<input type="number" min="1" max={selectedInventory?.storageAvailable??1} value={quantity} onChange={event=>setQuantity(event.target.value)} aria-label="出品数" className="mt-1 w-full rounded-xl border p-3"/></label>
            {selectedInventory&&<SellingAssistant key={inventoryId+":"+channel} inventoryId={inventoryId} channel={channel} quantity={Number(quantity)} condition={condition} onApply={draft=>{setTitle(draft.title);setDescription(draft.description);if(draft.price!==null)setPrice(String(draft.price));setShippingMethod(draft.shippingMethod);setShippingCost(String(draft.shippingCost));setPackagingCost(draft.packagingCost===null?"":String(draft.packagingCost));setNotice("候補を入力欄へ反映しました。説明文の要確認箇所を直して保存してください。");}}/>}
            <input aria-label="出品タイトル" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="出品タイトル" className="w-full rounded-xl border p-3" />
            <textarea aria-label="商品説明" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="状態、付属品、傷、保管状況などの商品説明" rows={6} className="w-full rounded-xl border p-3" />
            <div className="grid grid-cols-2 gap-2"><input type="number" value={price} onChange={(event) => setPrice(event.target.value)} aria-label="販売価格" placeholder="1点の販売価格（円）" className="rounded-xl border p-3" /></div>
            <div className="grid grid-cols-2 gap-2"><input value={shippingMethod} onChange={(event) => setShippingMethod(event.target.value)} placeholder="配送方法" className="rounded-xl border p-3" /><input type="number" value={shippingCost} onChange={(event) => setShippingCost(event.target.value)} placeholder="予定送料" className="rounded-xl border p-3" /></div>
            <label className="block text-sm font-bold">今回の梱包費（円）<input aria-label="今回の梱包費" type="number" min="0" value={packagingCost} onChange={e=>setPackagingCost(e.target.value)} placeholder="袋・箱・緩衝材の合計" className="mt-1 w-full rounded-xl border p-3"/></label>
            {estimatedTakeHome!==null&&<p className="rounded-xl bg-indigo-50 p-3 font-bold text-indigo-800">概算手取り {estimatedTakeHome.toLocaleString("ja-JP")}円（手数料・送料・梱包費を差し引き、原価を引く前）</p>}{estimatedProfit!==null ? <div className={"rounded-xl p-3 font-black "+(estimatedProfit>=0?"bg-emerald-50 text-emerald-800":"bg-red-50 text-red-700")}>この数量の概算利益 {estimatedProfit.toLocaleString("ja-JP")}円（手数料{feeBps!/100}%）</div>:<p className="text-sm text-slate-500">原価・送料・梱包費がそろうと、利益を表示します。</p>}
            <button type="button" disabled={!!working || !inventoryId || !condition || !price || !Number.isInteger(Number(quantity)) || Number(quantity)<1 || Number(quantity)>(selectedInventory?.storageAvailable??0)} onClick={() => void createDraft()} className="w-full rounded-xl bg-violet-700 px-4 py-3 font-black text-white disabled:opacity-40">出品準備へ追加</button>
          </div></div>

          <div className={preparing?"hidden":"space-y-4"}><Pagination page={currentPage} totalPages={pages} start={(currentPage-1)*30} end={Math.min(currentPage*30, visibleListings.length)} total={visibleListings.length} onPageChange={setPage} />{visibleListings.length === 0 ? <div className="rounded-3xl bg-white p-8 text-center text-slate-500">この条件に該当する出品はありません。</div> : pageRows.map((listing) => {
            const count=listing.status==="SOLD"?listing.soldQuantity:listing.listedQuantity;
            const listingRate=data.channels?.find(row=>row.channel===listing.channel)?.feeRateBps??(listing.channel==="mercari"?1000:listing.channel==="yahoo_furima"?500:null);
            const takeHome=marketplaceTakeHome(listing.price,count,listingRate,listing.shippingCost,listing.packagingCost,listing.fee);
            const profit=listing.shippingCost!==null&&listing.packagingCost!==null&&listing.acquisitionCostSnapshot!==null&&(listing.fee!==null||listingRate!==null)?listing.price*count-(listing.fee??Math.ceil(listing.price*count*listingRate!/10000))-listing.shippingCost-listing.packagingCost-listing.acquisitionCostSnapshot*count:null;
            return <article key={listing.id} className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-black text-violet-700">{channelLabels[listing.channel] ?? listing.channel} ・ {statusLabels[listing.status] ?? listing.status}</p><h2 className="mt-1 text-xl font-black">{listing.title}</h2><p className="mt-1 text-sm text-slate-500">在庫：{listing.inventoryInstance.item.name} ／ {listing.inventoryInstance.item.janCode?`JAN ${listing.inventoryInstance.item.janCode}`:listing.inventoryInstance.item.systemBarcode?`システムJAN ${listing.inventoryInstance.item.systemBarcode}`:"コードなし"}</p><p className="mt-1 text-sm">{listing.inventoryInstance.storageLocation?.name||"場所未設定"}・Lot {listing.inventoryInstance.lotNo||"なし"} ／ 現在庫 {listing.inventoryInstance.quantity}</p><Link href={"/items/"+listing.inventoryInstance.item.id+"?inventoryId="+encodeURIComponent(listing.inventoryInstance.id)} className="text-sm font-bold text-blue-700 underline">元の商品・在庫を見る</Link></div><div className="text-right"><p className="text-2xl font-black">{listing.price.toLocaleString("ja-JP")}円</p>{takeHome!==null&&<p className="text-sm font-bold text-indigo-700">概算手取り {takeHome.toLocaleString("ja-JP")}円</p>}<p className={`text-sm font-bold ${(profit??0) >= 0 ? "text-emerald-700" : "text-red-600"}`}>{profit===null?"費用を確認すると利益を表示":`概算利益 ${profit.toLocaleString("ja-JP")}円`}</p></div></div>
              <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void copyDraft(listing)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black">出品文をコピー</button>{listing.listingUrl && <a href={listing.listingUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-black text-blue-700">出品ページ</a>}{listing.status === "DRAFT" && <button disabled={!!working} onClick={() => void update(listing.id, { status: "READY" })} className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-black text-white">次へ：原稿完成</button>}{listing.status === "READY" && <button disabled={!!working} onClick={() => void update(listing.id, { status: "LISTED" })} className="rounded-xl bg-violet-700 px-3 py-2 text-sm font-black text-white">外部サイトに出品済み</button>}{listing.status === "LISTED" && <button disabled={!!working} onClick={() => void update(listing.id, { status: "SOLD", soldQuantity: listing.listedQuantity })} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white">売れた：{listing.listedQuantity}点を在庫から減らす</button>}{!["SOLD", "CANCELLED"].includes(listing.status) && <button disabled={!!working} onClick={() => void update(listing.id, { status: "CANCELLED" })} className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-black text-white">取下げ</button>}</div>
              {admin.active&&<button className="mt-3 rounded-xl border border-violet-300 px-3 py-2 text-sm font-bold text-violet-800" onClick={()=>{setReversal(listing);setReason("");setStockConfirmed(false);setTargetStatus(listing.status==="DRAFT"?"CANCELLED":"DRAFT");}}>取消・差戻し</button>}
              {listing.status === "SOLD" && <div className="mt-4 rounded-2xl bg-orange-50 p-4"><p className="mb-2 text-sm">発送地：{listing.shippingOriginPrefecture||"未設定"}</p>{listing.shippingDueAt&&!["SHIPPED","DELIVERED","SETTLED"].includes(listing.shippingStatus)&&<p className={new Date(listing.shippingDueAt).getTime()<Date.now()?"mb-2 font-bold text-red-700":"mb-2 font-bold text-orange-900"}>発送目標：{new Date(listing.shippingDueAt).toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo"})}まで{new Date(listing.shippingDueAt).getTime()<Date.now()?"（期限を過ぎています）":""}</p>}<p className="font-black text-orange-900">発送：{shippingLabels[listing.shippingStatus] ?? listing.shippingStatus}</p><div className="mt-3 flex flex-wrap gap-2">{[["PACKING", "梱包中"], ["READY_TO_SHIP", "発送待ち"], ["SHIPPED", "発送済み"], ["DELIVERED", "配達済み"], ["SETTLED", "取引完了"]].filter(([value])=>value===({NOT_READY:"PACKING",PACKING:"READY_TO_SHIP",READY_TO_SHIP:"SHIPPED",SHIPPED:"DELIVERED",DELIVERED:"SETTLED"} as Record<string,string>)[listing.shippingStatus]).map(([value, label]) => <button key={value} disabled={!!working} onClick={() => void update(listing.id, { action: "UPDATE_SHIPPING", shippingStatus: value })} className="rounded-lg bg-white px-3 py-2 text-xs font-black shadow-sm">{label}</button>)}</div></div>}
            </article>;
          })}</div>
        </section>
      </div>
      {scannerOpen&&<UnifiedScanner title="出品する在庫をJAN・QRで探す" notice="JANは在庫候補、大分類QRは分類、保管場所QRは場所で絞り込みます。同じJANのロットは自分で選びます。" onProduct={async code=>{const response=await fetchFresh("/api/admin/marketplace/listings?"+new URLSearchParams({inventoryQuery:code}));if(!response.ok)throw new Error("SCAN_LOOKUP_FAILED：在庫を確認できません。通信を確認して再度読み取ってください。");const next=await response.json() as Payload;if(!next.inventories.some(entry=>entry.storageAvailable>0&&[entry.id,entry.item.id,entry.item.janCode,entry.item.systemBarcode].includes(code)))throw new Error("SCAN_JAN_NOT_MANAGED：このJAN・商品コードに出品できる在庫がありません。登録内容と在庫数を確認してください。");setData(next);setInventoryQuery(code);setInventoryId("");setCategoryFilter("");setLocationFilter("");}} onCategory={name=>{setCategoryFilter(name);setInventoryQuery("");setInventoryId("");}} onLocation={place=>{setLocationFilter(place.name);setInventoryQuery("");setInventoryId("");}} onClose={()=>setScannerOpen(false)}/>}
      {adminPanel&&admin.active&&<div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/60 p-4"><section role="dialog" aria-modal="true" aria-label="フリマの取消・差戻し" className="max-h-[85dvh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5"><h2 className="text-xl font-black">取消・差戻しする出品を選ぶ</h2><p className="my-3 text-sm">販売履歴は残します。販売済みの場合は現物を確認して在庫を戻します。</p><div className="grid gap-2">{data.listings.map(row=><button key={row.id} className="rounded-xl border p-3 text-left" onClick={()=>{setAdminPanel(false);setReversal(row);setReason("");setStockConfirmed(false);setTargetStatus(row.status==="DRAFT"?"CANCELLED":"DRAFT");}}>{row.title} ／ {statusLabels[row.status]}</button>)}</div><button className="mt-4 rounded-xl border p-3" onClick={()=>setAdminPanel(false)}>閉じる</button></section></div>}
      {reversal&&<div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/60 p-4"><section role="dialog" aria-modal="true" aria-label="取消・差戻しの確認" className="w-full max-w-lg rounded-2xl bg-white p-5"><h2 className="text-xl font-black">{reversal.title}の取消・差戻し</h2><p className="my-3">{reversal.status==="SOLD"?reversal.soldQuantity:0}点を元の在庫へ戻します。併売の出品は自動再開しません。</p><select aria-label="戻し先" className="w-full rounded-xl border p-3" value={targetStatus} onChange={e=>setTargetStatus(e.target.value)}><option value="DRAFT" disabled={reversal.status==="DRAFT"}>出品準備に差し戻す</option><option value="CANCELLED" disabled={reversal.status==="CANCELLED"}>取り消して終了</option></select><textarea aria-label="取消・差戻し理由" className="mt-3 w-full rounded-xl border p-3" placeholder="理由（必須）" value={reason} onChange={e=>setReason(e.target.value)}/>{reversal.status==="SOLD"&&<label className="my-3 flex gap-2"><input type="checkbox" checked={stockConfirmed} onChange={e=>setStockConfirmed(e.target.checked)}/>販売した商品は未発送または返却済みで、元の在庫に戻せます</label>}<p className="my-3 text-sm">外部サイトの取消・返金は別途行ってください。</p><div className="flex gap-3"><button disabled={!!working||!reason.trim()||(reversal.status==="SOLD"&&!stockConfirmed)} className="rounded-xl bg-violet-700 p-3 font-bold text-white disabled:opacity-40" onClick={()=>{if(!admin.active){admin.open();return;}void update(reversal.id,{action:"ADMIN_REVERSE",targetStatus,reason,stockConfirmed,expectedUpdatedAt:reversal.updatedAt});}}>{admin.active?"確認した内容で実行":"認証して続ける"}</button><button disabled={!!working} className="rounded-xl border p-3" onClick={()=>setReversal(null)}>戻る</button></div></section></div>}
    </main>
  );
}
