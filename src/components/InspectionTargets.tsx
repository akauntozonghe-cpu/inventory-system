"use client";
import Link from "next/link";
import ProductEditDialog from "@/components/ProductEditDialog";
import { useEffect, useRef, useState } from "react";
import { targetChecks, type InspectionTarget } from "@/lib/inspection-target-types";
import ReopenStocktakeButton from "@/components/stocktake/ReopenStocktakeButton";
export default function InspectionTargets({ checkCode, runId, onChanged, onNavigate }: {
    checkCode: string;
    runId: string;
    onChanged?: () => void | Promise<void>;
    onNavigate?: () => void;
}) {
    const [targets, setTargets] = useState<InspectionTarget[]>([]), [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
    const [selected, setSelected] = useState<InspectionTarget | null>(null), [reason, setReason] = useState(""), [value, setValue] = useState(""), [confirmed, setConfirmed] = useState(false);
    const [editingProduct, setEditingProduct] = useState<string | null>(null);
    const generation = useRef(0);
    async function load(append = false) { const version = ++generation.current; setBusy(true); setError(""); try {
        const query = new URLSearchParams({ runId, checkCode, ...(append && cursor ? { cursor } : {}) });
        const response = await fetch("/api/admin/system-check/targets?" + query, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok)
            throw new Error(`${data.code}：${data.message}`);
        if (version === generation.current) {
            setTargets(old => append ? [...old, ...data.targets] : data.targets);
            setCursor(data.nextCursor);
        }
    }
    catch (error) {
        if (version === generation.current)
            setError(error instanceof Error ? error.message : "対象を取得できませんでした。");
    }
    finally {
        if (version === generation.current)
            setBusy(false);
    } }
    useEffect(() => { setTargets([]); setSelected(null); setMessage(""); void load(); return () => { generation.current++; }; }, [runId, checkCode]); // eslint-disable-line react-hooks/exhaustive-deps
    async function save() {
        if (!selected)
            return;
        setBusy(true);
        setError("");
        try {
            const barcode = selected.action === "ISSUE_SYSTEM_BARCODE";
            const response = await fetch(barcode ? "/api/items/system-barcode" : "/api/admin/system-check/targets", { method: barcode ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(barcode ? { itemId: selected.itemId } : { runId, checkCode, action: selected.action, targetId: selected.id, expectedUpdatedAt: selected.updatedAt, itemUpdatedAt: selected.itemUpdatedAt, sessionUpdatedAt: selected.sessionUpdatedAt, reason, unit: value, expectedQuantity: selected.action === "RESTORE_TARGET" && value.trim() !== "" ? Number(value) : undefined }) });
            const data = await response.json();
            if (!response.ok)
                throw new Error(`${data.code}：${data.message}`);
            setSelected(null);
            setReason("");
            setValue("");
            setConfirmed(false);
            setMessage(data.message);
            await load();
            await onChanged?.();
        }
        catch (error) {
            setError(error instanceof Error ? error.message : "保存できませんでした。");
        }
        finally {
            setBusy(false);
        }
    }
    const label = (target: InspectionTarget) => target.action === "SYNC_PRODUCT_METADATA" ? "この在庫の分類・メーカーを揃える" : target.action === "SET_UNIT" ? "この在庫の単位を修正" : target.action === "RESTORE_TARGET" ? "この記録を棚卸対象へ戻す" : "JANがない商品にシステムJANを発行";
    return <section className="mt-3 space-y-3" aria-label="点検の対象と処置">{editingProduct && <ProductEditDialog itemId={editingProduct} onClose={() => setEditingProduct(null)} onSaved={() => { setEditingProduct(null); void load(); void onChanged?.(); }}/>}<p className="text-sm">現時点で該当する対象です。商品・担当者・Lotと変更内容を確認し、1件ずつ対応してください。</p>{error && <p role="alert" className="break-words font-bold text-red-700">{error}</p>}{message && <p role="status" className="font-bold text-blue-800">{message}</p>}
 {targets.map(target => <article key={target.id} className="rounded-xl border border-slate-300 bg-white p-4"><h4 className="break-words text-lg font-bold">{target.name}</h4>{target.owner && <p className="font-bold">担当者：{target.owner}</p>}{target.inventoryId && <p>Lot：{target.lot || "未設定"} ／ 保管場所：{target.location || "未設定"}</p>}<dl className="my-3 space-y-1"><div><dt className="font-bold">現在の状態</dt><dd>{target.current}</dd></div><div><dt className="font-bold">直した後の状態</dt><dd>{target.expected}</dd></div></dl>
 {target.differences?.map(diff => <p key={diff.field} className="my-1 rounded-lg bg-blue-50 p-2">{diff.field}：{diff.before || "未設定"} → <strong>{diff.after || "未設定"}</strong></p>)}<p className="my-3 text-sm">{target.instruction}</p>
 <div className="flex flex-wrap gap-2">{target.editProduct && target.itemId && <button disabled={busy} className="rounded-xl border p-3 font-bold" onClick={() => setEditingProduct(target.itemId!)}>この商品の情報を修正</button>}{target.action && <button disabled={busy} onClick={() => { setSelected(target); setReason(""); setValue(""); setConfirmed(false); setError(""); }} className="rounded-xl bg-blue-700 p-3 font-bold text-white disabled:opacity-50">{label(target)}</button>}{target.sessionId && target.status && (checkCode === "CHECK_REVIEW_RECORDS" || checkCode === "CHECK_STOCKTAKE_LEGACY_STATE") && <ReopenStocktakeButton sessionId={target.sessionId} sessionTitle={target.name} owner={target.owner} status={target.status} disabled={busy} navigateOnReopened={false} onReopened={() => { void load(); void onChanged?.(); }}/>}<Link onClick={onNavigate} href={target.href} className="rounded-xl border p-3 font-bold underline">{target.sessionId ? "この担当者の棚卸記録を開く" : "対象の在庫詳細を開く"}</Link></div>
 {selected?.id === target.id && <form className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3" onSubmit={event => { event.preventDefault(); void save(); }}><p className="font-bold">変更対象：{target.name}{target.lot ? ` / Lot ${target.lot}` : ""}</p>{target.action === "SET_UNIT" && <label className="block font-bold">この在庫の数量単位<input required maxLength={30} list="inspection-unit-options" value={value} onChange={event => setValue(event.target.value)} className="mt-1 w-full rounded-xl border p-3" placeholder="例：個、箱"/><datalist id="inspection-unit-options"><option value="個"/><option value="箱"/><option value="本"/><option value="袋"/></datalist></label>}{target.action === "RESTORE_TARGET" && <label className="block font-bold">開始時の基準数量（記録で確認した値）<input required type="number" min={0} max={2147483647} step={1} value={value} onChange={event => setValue(event.target.value)} className="mt-1 w-full rounded-xl border p-3"/><span className="text-sm font-normal">数えた数量はそのまま残します。基準が分からない場合は保存せず、記録を確認してください。</span></label>}{target.action !== "ISSUE_SYSTEM_BARCODE" && <label className="block font-bold">変更理由<textarea required minLength={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded-xl border p-3"/></label>}<label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>対象と変更内容を確認しました{target.action === "ISSUE_SYSTEM_BARCODE" && "（商品にJANが付いていないことを確認済み）"}</label><div className="flex flex-wrap gap-2"><button disabled={busy || !confirmed} type="submit" className="rounded-xl bg-blue-700 p-3 font-bold text-white disabled:opacity-50">この対象だけ保存して再確認</button><button disabled={busy} type="button" onClick={() => setSelected(null)} className="rounded-xl border p-3">変更せず戻る</button></div></form>}
 </article>)}{busy && <p role="status">対象を確認中…</p>}{!busy && !error && targets.length === 0 && <p role="status" className="rounded-xl bg-blue-50 p-3">現在、この項目に該当する対象はありません。すでに変更された可能性があります。点検をやり直して判定を更新してください。</p>}<div className="flex flex-wrap gap-2"><button disabled={busy} className="rounded-xl border p-3" onClick={() => { setSelected(null); void load(); }}>対象を再確認</button>{cursor && <button disabled={busy} className="rounded-xl border p-3" onClick={() => void load(true)}>続きの対象を表示（50件ずつ）</button>}{onChanged && <button disabled={busy} className="rounded-xl border p-3 font-bold" onClick={() => void onChanged()}>点検をやり直して判定を更新</button>}</div></section>;
}
export const hasInspectionTargets = (code: string) => targetChecks.includes(code as typeof targetChecks[number]);
