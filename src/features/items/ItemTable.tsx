"use client";
import ImeInput from "@/components/common/ImeInput";
import { useAppAccess } from "@/components/auth/AppAccessProvider";


import Pagination from "@/components/common/Pagination";
import { usePagedItems } from "@/hooks/usePagedItems";
import Modal from "@/components/common/Modal";
import Link from "@/components/auth/PermissionLink";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
const LabelPrintDialog=dynamic(()=>import("@/components/LabelPrintDialog"),{ssr:false});

import type { Item } from "./types";
import ItemCompactCard from "./ItemCompactCard";

type Props = {
  items: Item[];
  isAdmin: boolean;
  archivedView?: boolean;
  filterKey: string;
  reload: () => void | Promise<void>;
};

const bulkLabels={DELETE:"削除",RESTORE:"復元",EXCLUDE_INSPECTION:"対象から外す",INCLUDE_INSPECTION:"対象に戻す",SET_MANUFACTURER:"メーカーを変更",SET_MAJOR_CATEGORY:"大分類を変更",SET_MINOR_CATEGORY:"小分類を変更",SET_UNIT:"既定単位を変更"};
type BulkOperation = keyof typeof bulkLabels;
type DeletePreview = { eligible: {id:string;name:string}[]; blocked: {id:string;name:string;reasons:string[]}[]; eligibleCount:number; blockedCount:number };

function getMessage(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      `サーバーから応答を取得できませんでした。HTTP ${response.status}`
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `サーバーから正しい応答を取得できませんでした。HTTP ${response.status}`
    );
  }
}

export default function ItemTable({ items, reload, isAdmin, archivedView = false, filterKey }: Props) {
  const {can} = useAppAccess();
  const pagination = usePagedItems(items, filterKey);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [bulkOperation, setBulkOperation] = useState<BulkOperation | null>(
    null
  );
  const [reason, setReason] = useState("");
  const [bulkValue,setBulkValue]=useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [deletePreview,setDeletePreview] = useState<DeletePreview|null>(null);
  const [previewBusy,setPreviewBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [printIds,setPrintIds]=useState<string[]|null>(null);

  useEffect(() => {
    const availableIds = new Set(items.map(item => item.id));
    setSelectedIds((current) =>
      current.filter((id) => availableIds.has(id))
    );
  }, [items]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIdSet.has(item.id)),
    [items, selectedIdSet]
  );


  const allSelected = items.length > 0 && selectedIds.length === items.length;

  const toggleItem = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : [...current, id]
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(items.map((item) => item.id));
  };

  const closeBulkDialog = () => {
    if (submitting) {
      return;
    }

    setBulkOperation(null);
    setDeletePreview(null);
    setReason("");
    setBulkValue("");
    setConfirmed(false);
  };

  const openBulkDialog = async (operation: BulkOperation) => {
    if (!isAdmin || selectedItems.length === 0) {
      return;
    }

    setError("");
    setMessage("");
    setReason("");
    setBulkValue("");
    setConfirmed(false);
    setBulkOperation(operation);
    setDeletePreview(null);
    if(operation==="DELETE"){
      setPreviewBusy(true);
      try {
        const response=await fetch("/api/items/bulk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operation:"DELETE",preview:true,itemIds:selectedItems.map(item=>item.id)})});
        const data=await readJson(response);
        if(!response.ok)throw new Error(getMessage(data,"削除対象を確認できませんでした。"));
        setDeletePreview(data as DeletePreview);
      } catch(error) {
        setError(error instanceof Error?error.message:"削除対象を確認できませんでした。");
      } finally {setPreviewBusy(false);}
    }
  };

  const runBulkOperation = async () => {
    if (!bulkOperation || !isAdmin) {
      return;
    }

    if (reason.trim().length < 2) {
      setError("変更理由を2文字以上で入力してください。");
      return;
    }

    if (bulkOperation==="DELETE" && (!deletePreview || !deletePreview.eligibleCount)) {
      setError("削除可能な商品のみを選択してください。");
      return;
    }

    if (!confirmed) {
      setError("内容を確認したチェックを入れてください。");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/items/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operation: bulkOperation,
          itemIds: selectedItems.map((item) => item.id),
          reason: reason.trim(),
          ...(bulkOperation.startsWith("SET_")?{value:bulkValue}:{}),
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(data, "一括操作に失敗しました。もう一度お試しください。")
        );
      }

      const actionLabel =
        bulkLabels[bulkOperation];

      const result = data as {message?:string};
      setMessage(result.message || `${selectedItems.length}件を${actionLabel}しました。`);
      setSelectedIds([]);
      setBulkOperation(null);
      setDeletePreview(null);
      setConfirmed(false);
      setReason("");
      await reload();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "一括操作に失敗しました。"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const printSelected = () => setPrintIds(selectedItems.map(item=>item.id));

  if (items.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-10 text-center shadow-sm">
        <p className="font-bold text-slate-700">{archivedView ? "削除済みの商品はありません。" : "該当する商品がありません。"}</p>
        <p className="mt-2 text-sm text-slate-500">
          {archivedView ? "削除済み商品は管理者専用の一覧にまとめられます。" : "検索条件・分類・在庫状態を変更してみてください。"}
        </p>
      </section>
    );
  }

  return (
    <>
      {!archivedView&&can("LABEL_PRINT")&&printIds&&<LabelPrintDialog labels={items.filter(item=>printIds.includes(item.id)).map(item=>({id:item.id,itemId:item.id,name:item.name,barcode:item.janCode||item.systemBarcode}))} canEdit={isAdmin} onRefresh={reload} onClose={()=>setPrintIds(null)} onComplete={()=>setSelectedIds([])}/>}
      <section className="space-y-4">
        {(isAdmin || can("LABEL_PRINT")) && <div className="rounded-2xl border bg-white p-3">

        {(message || error) && (
          <div
            className={`rounded-2xl p-4 font-bold ${
              error
                ? "border border-red-200 bg-red-50 text-red-700"
                : "border border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error || message}
          </div>
        )}

        <div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {(isAdmin || can("LABEL_PRINT")) ? (
              <label className="flex items-center gap-3 font-bold text-slate-700">
                <ImeInput
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-5 w-5"
                />
                検索結果の全{items.length}件を選択（全ページ）
              </label>
            ) : (
              <p className="text-sm font-bold text-slate-600">
                商品ラベルをまとめて印刷できます。
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {!archivedView&&can("LABEL_PRINT") && <button
                type="button"
                onClick={printSelected}
                disabled={selectedItems.length === 0}
                className="rounded-xl bg-slate-800 px-4 py-3 font-bold text-white transition hover:bg-slate-950 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {`選択した${selectedItems.length}件を印刷`}
              </button>}

              {selectedItems.length > 0 && <button onClick={() => setSelectedIds([])} className="rounded-xl border px-3 py-2 font-bold">選択解除</button>}
              {isAdmin && (
                <details className="rounded-xl border p-3"><summary className="cursor-pointer font-bold">選択した商品をまとめて操作</summary><div className="mt-2 flex flex-wrap gap-2">
                  {!archivedView ? <>
                    <button disabled={!selectedItems.length} onClick={()=>void openBulkDialog("EXCLUDE_INSPECTION")} className="rounded-xl border px-3 py-2 text-sm font-bold">棚卸対象から外す</button>
                    <button disabled={!selectedItems.length} onClick={()=>void openBulkDialog("INCLUDE_INSPECTION")} className="rounded-xl border px-3 py-2 text-sm font-bold">棚卸対象に戻す</button>
                    <details className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <summary className="cursor-pointer px-2 py-1 text-sm font-bold text-slate-800">商品共通情報をまとめて編集</summary>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(["SET_MANUFACTURER","SET_MAJOR_CATEGORY","SET_MINOR_CATEGORY","SET_UNIT"] as const).map(operation=>
                          <button key={operation} type="button" disabled={!selectedItems.length} onClick={()=>void openBulkDialog(operation)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50">{bulkLabels[operation]}</button>
                        )}
                      </div>
                    </details>
                    <button disabled={!selectedItems.length} onClick={()=>void openBulkDialog("DELETE")} className="rounded-xl border border-red-300 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-50">選択した商品を削除</button>
                  </> : <button disabled={!selectedItems.length} type="button" onClick={()=>void openBulkDialog("RESTORE")} className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 font-bold text-emerald-800 disabled:opacity-50">選択した商品を復元</button>}
                </div><p className="mt-2 text-sm text-slate-500">{archivedView ? "選択した削除済み商品をまとめて復元できます。" : "削除しても在庫・棚卸・取引の履歴は残り、管理者が復元できます。"}</p></details>
              )}
            </div>
          </div>

          <p role="status" className="mt-2 text-sm text-slate-600">選択 {selectedItems.length}件</p>
        </div>

        </div>}
        <Pagination {...pagination} />
        <div aria-label="商品検索結果" className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {pagination.visible.map(item=>(
            <ItemCompactCard key={item.id} item={item}
              selected={selectedIdSet.has(item.id)}
              canSelect={isAdmin||can("LABEL_PRINT")} archivedView={archivedView}
              onToggle={()=>toggleItem(item.id)}/>
          ))}
        </div>
        {pagination.totalPages > 1 && <Pagination {...pagination} />}
      </section>

      {bulkOperation && (
        <Modal titleId="bulk-operation-title" busy={submitting} onClose={() => setBulkOperation(null)}>
          <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <p
              className={`text-sm font-black ${
                bulkOperation === "DELETE"
                  ? "text-amber-600"
                  : "text-emerald-600"
              }`}
            >
              管理者のグループ一括操作
            </p>

            <h2 id="bulk-operation-title" className="mt-2 text-2xl font-black text-slate-900">
              {`選択したJANグループ全体を${bulkLabels[bulkOperation]}しますか？`}
            </h2>

            <p className="mt-3 text-slate-600">
              対象：{selectedItems.length}グループ（配下の全在庫明細）
              {bulkOperation==="DELETE"?"。履歴と在庫データは消さず、通常の検索・棚卸から除外します。管理者は後から復元できます。":bulkOperation==="RESTORE"?"。削除済み商品だけ復元します。個別に削除済みの在庫は復元されません。":bulkOperation.startsWith("SET_")?"。商品マスタの共通情報を同じ値に変更します。個別の在庫情報は保持します。":"。棚卸・点検の対象だけ変更します。在庫と履歴は保持します。"}
            </p>

            {bulkOperation==="DELETE" && (
              <div className="mt-4 space-y-3 rounded-xl border p-3">
                {previewBusy && <p>削除できる商品を確認しています…</p>}
                {!previewBusy && !deletePreview && <p className="text-red-700">診断を取得できませんでした。戻って再度開いてください。</p>}
                {deletePreview && <>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-lg bg-emerald-50 p-3"><p className="text-sm">削除可能</p><strong className="text-2xl">{deletePreview.eligibleCount}件</strong></div>
                    <div className="rounded-lg bg-amber-50 p-3"><p className="text-sm">既に削除済み</p><strong className="text-2xl">{deletePreview.blockedCount}件</strong></div>
                  </div>
                  {deletePreview.blocked.length>0 && <div className="max-h-48 overflow-y-auto"><p className="font-bold">今回の削除対象外</p>{deletePreview.blocked.map(item=><div key={item.id} className="mt-2 rounded-lg border p-2 text-sm"><strong>{item.name}</strong><p>{item.reasons.join("、")}</p></div>)}</div>}
                  {deletePreview.eligible.length>0 && <details><summary className="cursor-pointer font-bold">削除可能な商品を表示（{deletePreview.eligibleCount}件）</summary><div className="max-h-32 overflow-y-auto text-sm">{deletePreview.eligible.map(item=><p key={item.id}>{item.name}</p>)}</div></details>}
                  <p className="text-xs text-slate-600">削除前の状態は実行時に再検証します。削除後も履歴は保存され、管理者が復元できます。</p>
                </>}
              </div>
            )}
            <p className="mt-3 font-bold text-blue-800">Lot・期限・分類ごとに操作する場合は、商品詳細を開き、対象明細の「この在庫だけ」を使用してください。</p>
            {bulkOperation.startsWith("SET_") && <label className="mt-4 block text-sm font-bold text-slate-800">
              {bulkLabels[bulkOperation]}：新しい値
              <input type="text" value={bulkValue} maxLength={200} onChange={e=>{setBulkValue(e.target.value);setConfirmed(false);}} placeholder="変更後の値を入力（空欄で未設定に戻す）" className="mt-2 w-full rounded-xl border border-slate-300 p-3"/>
              <span className="mt-1 block text-xs font-normal text-slate-500">選択した商品マスタの共通項目だけ変更します。ロットごとの個別設定はそのまま保持します。</span>
            </label>}
            <label className="mt-5 block">
              <span className="font-bold text-slate-800">
                変更理由
              </span>

              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="例：試験商品として管理確認済み、終売のため"
                maxLength={500}
                rows={3}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
              />
            </label>

            <label className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
              <ImeInput
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 h-5 w-5"
              />
              <span>
                内容を確認しました。この操作は管理者操作履歴に記録されます。
              </span>
            </label>

            {error && (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeBulkDialog}
                disabled={submitting}
                className="rounded-xl bg-slate-100 px-5 py-3 font-bold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed"
              >
                戻る
              </button>

              <button
                type="button"
                onClick={() => void runBulkOperation()}
                disabled={submitting || (bulkOperation==="DELETE" && (!deletePreview || !deletePreview.eligibleCount || previewBusy))}
                className={`rounded-xl px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 ${
                  bulkOperation === "DELETE"
                    ? "bg-amber-500 hover:bg-amber-600"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {submitting
                  ? "処理中…"
                  : bulkLabels[bulkOperation]+"を確定"}
              </button>
            </div>
          </section>
        </Modal>
      )}
    </>
  );
}
