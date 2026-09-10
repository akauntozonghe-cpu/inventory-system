"use client";
import { useEffect, useRef, useState } from "react";
import { canReopenStocktake } from "@/lib/stocktake-reopening";
import { useRouter } from "next/navigation";

export default function ReopenStocktakeButton({ sessionId, sessionTitle, owner, status, disabled = false, onReopened, navigateOnReopened = true }: { sessionId: string; sessionTitle?:string; owner?:string; status: string; disabled?: boolean; navigateOnReopened?: boolean; onReopened?: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(""), [error, setError] = useState("");
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  if (!canReopenStocktake(status)) return null;
  return <>
    <button type="button" disabled={disabled || busy} onClick={() => { setError(""); setOpen(true); }} className="rounded-xl bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-50">途中から再開</button>
    <dialog ref={dialog} aria-labelledby={`reopen-${sessionId}`} onCancel={event => { event.preventDefault(); if (!busy) setOpen(false); }} className="m-auto w-[min(94vw,32rem)] rounded-2xl p-6 text-slate-950 shadow-xl backdrop:bg-slate-950/60">
      <h2 id={`reopen-${sessionId}`} className="text-2xl font-black">{sessionTitle?`「${sessionTitle}」を再開`:"この担当者の棚卸を再開"}</h2>{owner&&<p className="my-2 text-sm">担当者：{owner}</p>}
      <p className="my-4">入力済みの数量・対象商品・担当者を残して作業中へ戻します。再開理由は管理者の操作履歴に記録されます。在庫は再開時には変更されません。</p>
      {status === "COMPLETED" && <p className="my-3 rounded-xl bg-blue-50 p-3 text-sm">前回の確定内容は操作履歴に保存します。元の担当者が続きを入力でき、次の正式確定では今回追加・修正した数量だけを在庫へ反映します。</p>}
      <form onSubmit={async event => {
        event.preventDefault(); setBusy(true); setError("");
        try {
          const response = await fetch(`/api/stocktake/session/${encodeURIComponent(sessionId)}/reopen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message ?? "再開できませんでした。");
          setOpen(false); onReopened?.(); if(navigateOnReopened){router.push(`/stocktake/${encodeURIComponent(result.session.id)}`); router.refresh();}
        } catch (caught) { setError(caught instanceof Error ? caught.message : "再開できませんでした。"); }
        finally { setBusy(false); }
      }}>
        <label className="block font-bold">再開理由<textarea required maxLength={300} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} className="mt-2 w-full rounded-xl border p-3" /></label>
        {error && <p role="alert" className="my-3 font-bold text-red-700">{error}</p>}
        <div className="mt-4 flex gap-3"><button type="submit" disabled={busy || !reason.trim()} className="rounded-xl bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? "再開中…" : "棚卸を再開する"}</button><button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-xl border px-4 py-3 font-bold">キャンセル</button></div>
      </form>
    </dialog>
  </>;
}
