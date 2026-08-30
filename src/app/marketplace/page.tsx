"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import FeedbackToast from "@/components/common/FeedbackToast";
import { recoverAfterFailure } from "@/lib/client-error-recovery";

type Inventory = { id: string; quantity: number; storageAvailable: number; acquisitionCost: number | null; item: { name: string; majorCategory: string | null }; storageLocation: { name: string } | null };
type Listing = { id: string; inventoryInstanceId: string; channel: string; title: string; description: string | null; category: string | null; itemCondition: string | null; listingUrl: string | null; price: number; listedQuantity: number; soldQuantity: number; fee: number | null; shippingCost: number | null; packagingCost: number | null; acquisitionCostSnapshot: number | null; shippingMethod: string | null; shippingStatus: string; trackingNumber: string | null; status: string; notes: string | null; updatedAt: string; inventoryInstance: { item: { name: string } } };
type Payload = { listings: Listing[]; inventories: Inventory[]; summary?: { preparing: number; listed: number; shipping: number; settledProfit: number } };
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

export default function PersonalMarketplacePage() {
  const [data, setData] = useState<Payload>({ listings: [], inventories: [] });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState<ErrorState | null>(null);
  const [notice, setNotice] = useState("");
  const [inventoryId, setInventoryId] = useState("");
  const [channel, setChannel] = useState("mercari");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState("目立った傷や汚れなし");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [shippingMethod, setShippingMethod] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const selectedInventory = data.inventories.find((entry) => entry.id === inventoryId);

  const fetchMarketplace = useCallback(async () => {
    const response = await fetch("/api/admin/marketplace/listings", { cache: "no-store" });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new MarketplaceRequestError(messageOf(payload, "フリマ情報を取得できませんでした。"), codeOf(payload, "MARKETPLACE_LIST_FAILED"));
    return payload as Payload;
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setData(await fetchMarketplace());
      setError(null);
    } catch (caught) {
      const code = caught instanceof MarketplaceRequestError ? caught.code : "MARKETPLACE_LIST_FAILED";
      const message = caught instanceof Error ? caught.message : "フリマ情報を取得できませんでした。";
      setError({ message, code, reportId: null, status: "RECOVERING" });
      const recovered = await recoverAfterFailure({ code, title: "フリマ情報取得エラー", message, route: "/marketplace", detail: { operation: "LIST" }, action: fetchMarketplace });
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
  }, [fetchMarketplace]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (error) return;
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [error, load]);

  useEffect(() => {
    if (!selectedInventory) return;
    setTitle((current) => current || selectedInventory.item.name);
  }, [selectedInventory]);

  const summary = data.summary ?? { preparing: 0, listed: 0, shipping: 0, settledProfit: 0 };
  const estimatedProfit = useMemo(() => {
    const sale = Number(price) || 0;
    const estimatedFee = Math.ceil(sale * 0.1);
    return sale - estimatedFee - (Number(shippingCost) || 0) - (selectedInventory?.acquisitionCost ?? 0);
  }, [price, selectedInventory, shippingCost]);

  const createDraft = async () => {
    setWorking("create"); setError(null);
    try {
      const response = await fetch("/api/admin/marketplace/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventoryInstanceId: inventoryId, channel, title, description, itemCondition: condition, price: Number(price), listedQuantity: Number(quantity), shippingMethod, shippingCost: Number(shippingCost) }) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, "出品準備を作成できませんでした。"));
      setNotice(messageOf(payload, "出品準備へ追加しました。"));
      setInventoryId(""); setTitle(""); setDescription(""); setPrice(""); setShippingCost("");
      await load(true);
    } catch (caught) { setError({ message: caught instanceof Error ? caught.message : "出品準備を作成できませんでした。", code: "MARKETPLACE_CREATE_FAILED", reportId: null, status: "ADMIN_REQUIRED" }); }
    finally { setWorking(""); }
  };

  const update = async (id: string, body: Record<string, unknown>) => {
    setWorking(id); setError(null);
    try {
      const response = await fetch("/api/admin/marketplace/listings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, "更新できませんでした。"));
      setNotice(messageOf(payload, "更新しました。")); await load(true);
    } catch (caught) { setError({ message: caught instanceof Error ? caught.message : "更新できませんでした。", code: "MARKETPLACE_UPDATE_FAILED", reportId: null, status: "ADMIN_REQUIRED" }); }
    finally { setWorking(""); }
  };

  const copyDraft = async (listing: Listing) => {
    const draft = `${listing.title}\n\n${listing.description ?? ""}\n\n状態：${listing.itemCondition ?? "-"}\n発送：${listing.shippingMethod ?? "未設定"}\n価格：${listing.price.toLocaleString("ja-JP")}円`;
    await navigator.clipboard.writeText(draft);
    setNotice("出品用のタイトル・説明・価格をコピーしました。");
  };

  if (loading) return <main className="min-h-screen bg-violet-50 p-8 text-center font-bold text-slate-600">個人フリマ管理を準備しています…</main>;

  return (
    <main className="min-h-screen bg-violet-50 p-4 text-slate-950 sm:p-8">
      <FeedbackToast tone="error" title="フリマエラー" message={error?.message ?? ""} errorCode={error?.code} reportId={error?.reportId} recoveryStatus={error?.status} onRetry={() => void load()} retrying={error?.status === "RECOVERING"} onClose={() => setError(null)} />
      <FeedbackToast tone="success" title="完了" message={notice} onClose={() => setNotice("")} />
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-black tracking-[0.2em] text-violet-700">PERSONAL FLEA MARKET</p><h1 className="mt-1 text-3xl font-black">個人フリマ統合管理</h1><p className="mt-2 text-slate-600">出品原稿、併売、在庫、梱包、発送、利益まで一か所で管理します。</p></div><div className="flex gap-2"><a href="/api/admin/marketplace/listings?format=csv" className="rounded-xl bg-emerald-600 px-4 py-3 font-black text-white">取引CSV</a><Link href="/" className="rounded-xl bg-slate-800 px-4 py-3 font-black text-white">ホーム</Link></div></header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["出品準備", summary.preparing], ["出品中", summary.listed], ["発送対応", summary.shipping], ["確定利益", `${summary.settledProfit.toLocaleString("ja-JP")}円`]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</section>

        <section className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <div className="h-fit rounded-3xl bg-white p-5 shadow-sm lg:sticky lg:top-5"><h2 className="text-xl font-black">在庫から出品準備</h2><div className="mt-4 space-y-3">
            <select value={inventoryId} onChange={(event) => { setInventoryId(event.target.value); setTitle(""); }} className="w-full rounded-xl border p-3 font-bold"><option value="">商品を選択</option>{data.inventories.filter((entry) => entry.storageAvailable > 0).map((entry) => <option key={entry.id} value={entry.id}>{entry.item.name}（利用可 {entry.storageAvailable}）</option>)}</select>
            <div className="grid grid-cols-3 gap-2">{Object.entries(channelLabels).slice(0, 3).map(([value, label]) => <button key={value} type="button" onClick={() => setChannel(value)} className={`rounded-xl px-2 py-3 text-sm font-black ${channel === value ? "bg-violet-700 text-white" : "bg-slate-100"}`}>{label}</button>)}</div>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="出品タイトル" className="w-full rounded-xl border p-3" />
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="状態、付属品、傷、保管状況などの商品説明" rows={6} className="w-full rounded-xl border p-3" />
            <input value={condition} onChange={(event) => setCondition(event.target.value)} placeholder="商品の状態" className="w-full rounded-xl border p-3" />
            <div className="grid grid-cols-2 gap-2"><input type="number" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="販売価格" className="rounded-xl border p-3" /><input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="出品数" className="rounded-xl border p-3" /></div>
            <div className="grid grid-cols-2 gap-2"><input value={shippingMethod} onChange={(event) => setShippingMethod(event.target.value)} placeholder="配送方法" className="rounded-xl border p-3" /><input type="number" value={shippingCost} onChange={(event) => setShippingCost(event.target.value)} placeholder="予定送料" className="rounded-xl border p-3" /></div>
            {price && <div className={`rounded-xl p-3 font-black ${estimatedProfit >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>概算利益：約 {estimatedProfit.toLocaleString("ja-JP")}円（手数料10%仮計算）</div>}
            <button type="button" disabled={working === "create" || !inventoryId || !price} onClick={() => void createDraft()} className="w-full rounded-xl bg-violet-700 px-4 py-3 font-black text-white disabled:opacity-40">出品準備へ追加</button>
          </div></div>

          <div className="space-y-4">{data.listings.length === 0 ? <div className="rounded-3xl bg-white p-8 text-center text-slate-500">出品準備はまだありません。</div> : data.listings.map((listing) => {
            const profit = listing.price * Math.max(listing.soldQuantity, 1) - (listing.fee ?? Math.ceil(listing.price * 0.1)) - (listing.shippingCost ?? 0) - (listing.packagingCost ?? 0) - (listing.acquisitionCostSnapshot ?? 0) * Math.max(listing.soldQuantity, 1);
            return <article key={listing.id} className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-black text-violet-700">{channelLabels[listing.channel] ?? listing.channel} ・ {statusLabels[listing.status] ?? listing.status}</p><h2 className="mt-1 text-xl font-black">{listing.title}</h2><p className="mt-1 text-sm text-slate-500">在庫：{listing.inventoryInstance.item.name}</p></div><div className="text-right"><p className="text-2xl font-black">{listing.price.toLocaleString("ja-JP")}円</p><p className={`text-sm font-bold ${profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>概算利益 {profit.toLocaleString("ja-JP")}円</p></div></div>
              <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void copyDraft(listing)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black">出品文をコピー</button>{listing.listingUrl && <a href={listing.listingUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-black text-blue-700">出品ページ</a>}{listing.status === "DRAFT" && <button disabled={working === listing.id} onClick={() => void update(listing.id, { status: "READY" })} className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-black text-white">原稿完成</button>}{listing.status === "READY" && <button disabled={working === listing.id} onClick={() => void update(listing.id, { status: "LISTED" })} className="rounded-xl bg-violet-700 px-3 py-2 text-sm font-black text-white">出品済みにする</button>}{listing.status === "LISTED" && <button disabled={working === listing.id} onClick={() => void update(listing.id, { status: "SOLD", soldQuantity: listing.listedQuantity })} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white">売れた・在庫反映</button>}{!["SOLD", "CANCELLED"].includes(listing.status) && <button disabled={working === listing.id} onClick={() => void update(listing.id, { status: "CANCELLED" })} className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-black text-white">取下げ</button>}</div>
              {listing.status === "SOLD" && <div className="mt-4 rounded-2xl bg-orange-50 p-4"><p className="font-black text-orange-900">発送：{shippingLabels[listing.shippingStatus] ?? listing.shippingStatus}</p><div className="mt-3 flex flex-wrap gap-2">{[["PACKING", "梱包中"], ["READY_TO_SHIP", "発送待ち"], ["SHIPPED", "発送済み"], ["DELIVERED", "配達済み"], ["SETTLED", "取引完了"]].map(([value, label]) => <button key={value} disabled={working === listing.id} onClick={() => void update(listing.id, { action: "UPDATE_SHIPPING", shippingStatus: value })} className="rounded-lg bg-white px-3 py-2 text-xs font-black shadow-sm">{label}</button>)}</div></div>}
            </article>;
          })}</div>
        </section>
      </div>
    </main>
  );
}
