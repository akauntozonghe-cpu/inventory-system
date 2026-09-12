"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/auth/PermissionLink";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { fetchFresh } from "@/lib/fetch-fresh";
import { PREFECTURES } from "@/lib/marketplace-settings";
import FeedbackToast from "@/components/common/FeedbackToast";

type Channel = { channel: string; displayName: string; feeRateBps: number };
type Rate = { id: string; carrier: string; methodName: string; fee: number; originPrefecture: string | null; maxWeightGrams: number | null; maxTotalDimensionsCm: number | null };
const channelNames: Record<string, string> = { mercari: "メルカリ", yahoo_furima: "Yahoo!フリマ", rakuma: "ラクマ", flea_market: "その他" };
const field = "mt-1 block w-full rounded-lg border border-slate-300 p-3";
const button = "rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white disabled:opacity-40";
const emptyShipping = { channel: "all", carrier: "", methodName: "", fee: "", maxWeightGrams: "", maxTotalDimensionsCm: "", originPrefecture: "", anonymous: false, tracking: true, compensation: false };

export default function MarketplaceSettingsPage() {
  const dirty = useRef(new Set<string>()), saving = useRef(false);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [target, setTarget] = useState("20"), [origin, setOrigin] = useState(""), [days, setDays] = useState("");
  const [fees, setFees] = useState<Record<string, string>>({}), [rates, setRates] = useState<Rate[]>([]);
  const [shipping, setShipping] = useState(emptyShipping);
  const [notice, setNotice] = useState(""), [error, setError] = useState("");
  async function load() {
    const response = await fetchFresh("/api/admin/marketplace/listings", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    if (!dirty.current.has("general")) {
      setTarget(String((data.recommendationSetting?.targetProfitRateBps ?? 2000) / 100));
      setOrigin(data.recommendationSetting?.shippingOriginPrefecture ?? "");
      setDays(String(data.recommendationSetting?.shippingLeadDays ?? ""));
    }
    setFees(current => Object.fromEntries(Object.keys(channelNames).map(channel => [channel, dirty.current.has(channel) ? current[channel] : String((data.channels as Channel[]).find(row => row.channel === channel)?.feeRateBps !== undefined ? data.channels.find((row: Channel) => row.channel === channel).feeRateBps / 100 : channel === "mercari" ? 10 : channel === "yahoo_furima" ? 5 : "")])));
    setRates(data.shippingRates); setReady(true);
  }
  useEffect(() => { void load().catch(e => setError(e.message)); }, []);
  useLiveRefresh(async () => { if (!dirty.current.size && !saving.current) await load(); });
  async function post(body: unknown, section: string) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/marketplace/advisor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      dirty.current.delete(section); setNotice(data.message);
      if (section === "shipping") setShipping(emptyShipping);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "保存できませんでした。"); }
    finally { saving.current = false; setBusy(false); }
  }
  const changeGeneral = (fn: () => void) => { dirty.current.add("general"); fn(); };
  const changeShipping = (value: Partial<typeof shipping>) => { dirty.current.add("shipping"); setShipping(current => ({ ...current, ...value })); };
  return <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
    <FeedbackToast tone="error" title="設定エラー" message={error} onClose={() => setError("")}/><FeedbackToast tone="success" title="保存完了" message={notice} onClose={() => setNotice("")}/>
    <div className="mx-auto max-w-5xl"><header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold">フリマの共通設定</h1><Link href="/marketplace" className="rounded-xl bg-slate-800 px-4 py-3 font-bold text-white">出品管理へ</Link></header>
      <p className="mt-3 text-slate-600">全員で同じ設定を使います。変更はこれから作る出品準備に反映されます。</p>
      <fieldset disabled={!ready || busy}>
        <section className="mt-6 rounded-2xl bg-white p-5"><h2 className="text-xl font-bold">発送地と発送の目安</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">発送地（都道府県）<select aria-label="発送地" value={origin} onChange={e => changeGeneral(() => setOrigin(e.target.value))} className={field}><option value="">未設定</option>{PREFECTURES.map(name => <option key={name}>{name}</option>)}</select></label>
            <label className="text-sm font-bold">販売から発送までの目標<select aria-label="発送までの日数" value={days} onChange={e => changeGeneral(() => setDays(e.target.value))} className={field}><option value="">未設定</option>{[1,2,3,4,5,6,7].map(day => <option key={day} value={day}>{day}日以内</option>)}</select></label></div>
          <p className="mt-3 text-sm text-slate-600">発送地は送料候補と出品準備に反映します。全国一律の配送は都道府県によって料金が変わりません。発送目標は売れた日から数えた期限を表示します。外部サイトで約束した期限も確認してください。</p>
          <label className="mt-5 block text-sm font-bold">提案する価格の目標利益率（%）<input aria-label="目標利益率" type="number" min="0" max="90" step="0.1" value={target} onChange={e => changeGeneral(() => setTarget(e.target.value))} className={field}/></label>
          <p className="mt-2 text-sm text-slate-600">販売履歴がない場合の価格目安に使います。梱包費は商品ごとに入力します。</p>
          <button disabled={target === "" || !Number.isFinite(Number(target)) || Number(target) < 0 || Number(target) > 90} onClick={() => void post({ action: "SAVE_RECOMMENDATION_SETTING", targetProfitRateBps: Math.round(Number(target) * 100), shippingOriginPrefecture: origin || null, shippingLeadDays: days ? Number(days) : null }, "general")} className={`${button} mt-4`}>発送・価格の設定を保存</button>
        </section>
        <section className="mt-6 rounded-2xl bg-white p-5"><h2 className="text-xl font-bold">販売先の手数料</h2><p className="mt-2 text-sm text-slate-600">手取り額と利益の計算に使います。割引や実績による料率は販売先のアカウントで確認し、適用する割合を保存してください。</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">{Object.entries(channelNames).map(([channel, name]) => <div key={channel} className="rounded-xl border p-4"><label className="text-sm font-bold">{name}（%）<input aria-label={`${name}の手数料`} type="number" min="0" max="100" step="0.1" placeholder="手数料を確認して入力" value={fees[channel] ?? ""} onChange={e => { dirty.current.add(channel); setFees(current => ({ ...current, [channel]: e.target.value })); }} className={field}/></label><button disabled={fees[channel] === undefined || fees[channel] === "" || !Number.isFinite(Number(fees[channel])) || Number(fees[channel]) < 0 || Number(fees[channel]) > 100} onClick={() => void post({ action: "SAVE_CHANNEL_FEE", channel, feeRateBps: Math.round(Number(fees[channel]) * 100) }, channel)} className={`${button} mt-3`}>手数料を保存</button></div>)}</div>
        </section>
        <details className="mt-6 rounded-2xl bg-white p-5"><summary className="cursor-pointer text-lg font-bold">独自の送料を登録する</summary><p className="mt-2 text-sm text-slate-600">対象の販売先・発送地に合う登録料金を優先します。送料が宛先で変わる場合は、この料金で発送できることを確認して使ってください。</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{([['carrier','配送会社'],['methodName','発送方法'],['fee','送料（円）'],['maxWeightGrams','最大重量（g）'],['maxTotalDimensionsCm','3辺合計（cm）']] as const).map(([key,label]) => <label key={key} className="text-sm font-bold">{label}<input value={shipping[key]} type={key === 'carrier' || key === 'methodName' ? 'text' : 'number'} min="0" step="1" onChange={e => changeShipping({ [key]: e.target.value })} className={field}/></label>)}
            <label className="text-sm font-bold">販売先<select value={shipping.channel} onChange={e => changeShipping({ channel: e.target.value })} className={field}><option value="all">すべての販売先</option>{Object.entries(channelNames).map(([key,name]) => <option key={key} value={key}>{name}</option>)}</select></label>
            <label className="text-sm font-bold">この送料を使う発送地<select value={shipping.originPrefecture} onChange={e => changeShipping({ originPrefecture: e.target.value })} className={field}><option value="">全国共通</option>{PREFECTURES.map(name => <option key={name}>{name}</option>)}</select></label>
          </div><div className="mt-3 flex flex-wrap gap-4">{([['anonymous','匿名'],['tracking','追跡'],['compensation','補償']] as const).map(([key,label]) => <label key={key}><input type="checkbox" checked={shipping[key]} onChange={e => changeShipping({ [key]: e.target.checked })}/> {label}</label>)}</div>
          <button disabled={!shipping.methodName.trim() || shipping.fee === ""} onClick={() => void post({ action: "SAVE_SHIPPING_RATE", ...shipping, fee: shipping.fee === "" ? null : Number(shipping.fee), maxWeightGrams: shipping.maxWeightGrams === "" ? null : Number(shipping.maxWeightGrams), maxTotalDimensionsCm: shipping.maxTotalDimensionsCm === "" ? null : Number(shipping.maxTotalDimensionsCm) }, "shipping")} className={`${button} mt-4`}>送料を追加</button>
          <ul className="mt-4 space-y-2">{rates.map(rate => <li key={rate.id} className="rounded-lg bg-slate-50 p-3 text-sm">{rate.carrier} {rate.methodName}：{rate.fee}円 ／ {rate.originPrefecture || "全国共通"} ／ {rate.maxWeightGrams ? `${rate.maxWeightGrams}gまで` : "重量未設定"} ／ {rate.maxTotalDimensionsCm ? `${rate.maxTotalDimensionsCm}cmまで` : "サイズ未設定"}</li>)}</ul>
        </details>
      </fieldset>
    </div>
  </main>;
}
