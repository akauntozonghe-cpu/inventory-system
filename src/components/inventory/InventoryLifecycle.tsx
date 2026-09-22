"use client";
import { useState } from "react";
import Modal from "@/components/common/Modal";
import { fetchFresh } from "@/lib/fetch-fresh";

type Stock = { id: string; status: string; updatedAt: string; lotNo: string | null; expirationDate: string | null; expirationManagementStatus?: string; majorCategory: string | null; minorCategory: string | null; inspectionExcluded?: boolean | null; storageLocation: { name: string } | null };
const labels = { ARCHIVE: "廃止", RESTORE: "復帰", EXCLUDE_INSPECTION: "点検対象外にする", INCLUDE_INSPECTION: "点検対象にする" } as const;
export default function InventoryLifecycle({ stock, groupExcluded, canManage, onSaved }: { stock: Stock; groupExcluded: boolean; canManage: boolean; onSaved: () => Promise<void> }) {
  const [action, setAction] = useState<keyof typeof labels | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const excluded = stock.inspectionExcluded ?? groupExcluded;
  return <div className="mt-4 rounded-xl border border-slate-200 p-3">
    <p className="font-bold">この在庫の点検：{stock.status === "廃止" ? "廃止のため対象外" : excluded ? "対象外" : "対象"}</p>
    {canManage && <div className="mt-2 flex flex-wrap gap-2">{([stock.status === "廃止" ? "RESTORE" : "ARCHIVE", excluded ? "INCLUDE_INSPECTION" : "EXCLUDE_INSPECTION"] as const).map(operation => <button type="button" key={operation} onClick={() => { setAction(operation); setReason(""); setError(""); }} className="rounded-lg border bg-white px-3 py-2 font-bold">この在庫だけ{labels[operation]}</button>)}</div>}
    {action && <Modal titleId="stock-lifecycle-title" busy={busy} onClose={() => { if (!busy) setAction(null); }}>
      <h2 id="stock-lifecycle-title" className="text-xl font-black">この在庫明細だけ{labels[action]}</h2>
      <p className="my-3">{stock.storageLocation?.name ?? "場所未設定"} ／ Lot {stock.lotNo ?? "なし"} ／ 期限 {stock.expirationDate ?? (stock.expirationManagementStatus === "NO_EXPIRY" ? "期限なし" : "未設定")} ／ {[stock.majorCategory, stock.minorCategory].filter(Boolean).join("・") || "分類未設定"}</p>
      <p className="break-all text-xs">在庫No.：{stock.id}</p>
      <p className="my-3 font-bold">同じJANの他の明細には反映しません。数量・履歴は保持します。</p>
      {error && <p role="alert" className="my-3 text-red-700">{error}</p>}
      <form onSubmit={async event => {
        event.preventDefault(); if (!canManage || busy) return;
        setBusy(true); setError("");
        try {
          const response = await fetchFresh(`/api/inventory/${encodeURIComponent(stock.id)}/lifecycle`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: action, reason, expectedUpdatedAt: stock.updatedAt }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message ?? "変更を保存できませんでした。");
          await onSaved(); setAction(null);
        } catch (caught) { setError(caught instanceof Error ? caught.message : "保存に失敗しました。"); }
        finally { setBusy(false); }
      }}>
        <label className="block font-bold">変更理由<textarea required minLength={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
        <button disabled={busy || !canManage} className="mt-3 rounded-xl bg-blue-700 p-3 font-bold text-white">この明細だけに確定</button>
        <button disabled={busy} type="button" onClick={() => setAction(null)} className="ml-3 rounded-xl border p-3">戻る</button>
      </form>
    </Modal>}
  </div>;
}
