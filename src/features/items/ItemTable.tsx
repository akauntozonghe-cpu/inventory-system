"use client";
import ProductIdentity from "@/components/inventory/ProductIdentity";
import StockStateSummary from "@/components/inventory/StockStateSummary";
import { displayUnit } from "@/lib/unit";

import Pagination from "@/components/common/Pagination";
import { usePagedItems } from "@/hooks/usePagedItems";
import Modal from "@/components/common/Modal";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LabelPrintDialog from "@/components/LabelPrintDialog";

import type { Item } from "./types";

type Props = {
  items: Item[];
  isAdmin: boolean;
  filterKey: string;
  reload: () => void | Promise<void>;
  onEdit: (item: Item) => void;
};

const bulkLabels={ARCHIVE:"廃止",RESTORE:"復元",EXCLUDE_INSPECTION:"点検対象外に設定",INCLUDE_INSPECTION:"点検対象へ戻す"};
type BulkOperation = keyof typeof bulkLabels;

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

export default function ItemTable({ items, reload, isAdmin, onEdit, filterKey }: Props) {
  const pagination = usePagedItems(items, filterKey);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [bulkOperation, setBulkOperation] = useState<BulkOperation | null>(
    null
  );
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
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
    setReason("");
    setConfirmed(false);
  };

  const openBulkDialog = (operation: BulkOperation) => {
    if (!isAdmin || selectedItems.length === 0) {
      return;
    }

    setError("");
    setMessage("");
    setReason("");
    setConfirmed(false);
    setBulkOperation(operation);
  };

  const runBulkOperation = async () => {
    if (!bulkOperation || !isAdmin) {
      return;
    }

    if (reason.trim().length < 2) {
      setError("変更理由を2文字以上で入力してください。");
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

      setMessage(`${selectedItems.length}件を${actionLabel}しました。`);
      setSelectedIds([]);
      closeBulkDialog();
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

  const printSelected = () => setPrintIds((selectedItems.length?selectedItems:items).map(item=>item.id));

  if (items.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-10 text-center shadow-sm">
        <p className="font-bold text-slate-700">該当する商品がありません。</p>
        <p className="mt-2 text-sm text-slate-500">
          検索条件・分類の絞り込み・廃止済み表示を確認してください。
        </p>
      </section>
    );
  }

  return (
    <>
      {printIds&&<LabelPrintDialog labels={items.filter(item=>printIds.includes(item.id)).map(item=>({id:item.id,itemId:item.id,name:item.name,barcode:item.janCode||item.systemBarcode}))} canEdit={isAdmin} onRefresh={reload} onClose={()=>setPrintIds(null)} onComplete={()=>setSelectedIds([])}/>}
      <section className="space-y-4">
        <details className="rounded-2xl border bg-white p-3"><summary className="cursor-pointer font-bold">ラベル印刷・複数商品の操作</summary>

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

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {isAdmin ? (
              <label className="flex items-center gap-3 font-bold text-slate-700">
                <input
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
              <button
                type="button"
                onClick={printSelected}
                disabled={items.length === 0}
                className="rounded-xl bg-slate-800 px-4 py-3 font-bold text-white transition hover:bg-slate-950 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {selectedItems.length > 0
                  ? `選択した${selectedItems.length}件を印刷`
                  : `検索結果の${items.length}件を印刷`}
              </button>

              {isAdmin && (
                <>
                  <button disabled={!selectedItems.length} onClick={()=>openBulkDialog("EXCLUDE_INSPECTION")} className="rounded-xl border p-3 font-bold">点検対象外にする</button><button disabled={!selectedItems.length} onClick={()=>openBulkDialog("INCLUDE_INSPECTION")} className="rounded-xl border p-3 font-bold">点検対象に戻す</button><button
                    type="button"
                    disabled={selectedItems.length === 0}
                    onClick={() => openBulkDialog("ARCHIVE")}
                    className="rounded-xl bg-amber-500 px-4 py-3 font-bold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    選択商品を廃止
                  </button>

                  <button
                    type="button"
                    disabled={selectedItems.length === 0}
                    onClick={() => openBulkDialog("RESTORE")}
                    className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    選択商品を復元
                  </button>
                </>
              )}
            </div>
          </div>

          {isAdmin && (
            <p className="mt-3 text-sm text-slate-500">
              選択中：{selectedItems.length}件。廃止は履歴を残して非表示にする操作で、在庫・棚卸履歴は削除しません。
            </p>
          )}
        </div>

        </details>
        <Pagination {...pagination} />
        <div className="grid gap-4 md:grid-cols-2">
          {pagination.visible.map((item) => {

            const category =
              [item.majorCategory, item.minorCategory]
                .filter(Boolean)
                .join(" / ") || "-";
            const locationNames = Array.from(
              new Set(
                item.inventoryInstances
                  .map((inventory) => inventory.storageLocation?.name)
                  .filter((name): name is string => Boolean(name))
              )
            );

            return (
              <article
                key={item.id}
                className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ${
                  item.isArchived
                    ? "ring-amber-300"
                    : "ring-slate-200"
                }`}
              >
                <div className="flex gap-3">
                  {isAdmin && (
                    <input
                      type="checkbox"
                      checked={selectedIdSet.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="mt-1 h-5 w-5 shrink-0"
                      aria-label={`${item.name}を選択`}
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="break-words text-lg font-black text-slate-900">
                        {item.name}
                      </h2>

                      <div className="flex gap-2">
                        {item.isArchived && (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                            廃止済み
                          </span>
                        )}


                      </div>
                    </div>

                    <ProductIdentity item={item}/>{item.inspectionExcluded&&<p className="rounded-xl bg-amber-50 p-2 text-sm">点検対象外：{item.inspectionExclusionReason}</p>}
                    <StockStateSummary stocks={item.inventoryInstances} defaultUnit={item.defaultUnit} itemId={item.id}/>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="font-bold text-slate-500">保管場所</dt>
                        <dd className="mt-1 text-slate-800">
                          {locationNames.join("、") || "未設定"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-bold text-slate-500">分類</dt>
                        <dd className="mt-1 text-slate-800">{category}</dd>
                      </div>

                      <div>
                        <dt className="font-bold text-slate-500">メーカー</dt>
                        <dd className="mt-1 text-slate-800">
                          {item.manufacturer ?? "-"}
                        </dd>
                      </div>



                      <div>
                        <dt className="font-bold text-slate-500">基本単位</dt>
                        <dd className="mt-1 text-slate-800">
                          {displayUnit(item.defaultUnit)}
                        </dd>
                      </div>

                      <div>
                        <dt className="font-bold text-slate-500">登録日時</dt>
                        <dd className="mt-1 text-slate-800">
                          {new Date(item.createdAt).toLocaleString("ja-JP")}
                        </dd>
                      </div>
                    </dl>

                    {item.isArchived && item.archiveReason && (
                      <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        廃止理由：{item.archiveReason}
                      </p>
                    )}

                    <div className="mt-5 flex flex-wrap gap-2">
                      {isAdmin && <button type="button" onClick={() => onEdit(item)} className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 font-bold text-white">商品情報を編集</button>}
                      <button type="button" onClick={()=>setPrintIds([item.id])} className="rounded-xl border px-4 py-2 font-bold">この商品のJANを印刷</button><Link
                        href={`/items/${item.id}`}
                        className="rounded-xl bg-sky-600 px-4 py-2 font-bold text-white transition hover:bg-sky-700"
                      >
                        在庫・ロットの詳細
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {pagination.totalPages > 1 && <Pagination {...pagination} />}
      </section>

      {bulkOperation && (
        <Modal titleId="bulk-operation-title" busy={submitting} onClose={() => setBulkOperation(null)}>
          <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <p
              className={`text-sm font-black ${
                bulkOperation === "ARCHIVE"
                  ? "text-amber-600"
                  : "text-emerald-600"
              }`}
            >
              管理者操作
            </p>

            <h2 id="bulk-operation-title" className="mt-2 text-2xl font-black text-slate-900">
              {`選択商品を${bulkLabels[bulkOperation]}しますか？`}
            </h2>

            <p className="mt-3 text-slate-600">
              対象：{selectedItems.length}件
              {bulkOperation.includes("INSPECTION")?"。点検の対象だけ変更します。商品・在庫・棚卸の履歴は消しません。廃止商品は設定に関わらず点検対象外です。":bulkOperation==="ARCHIVE"?"。商品と在庫を通常の作業対象から外します。履歴と数量は保存します。":"。商品を通常の作業対象に戻します。在庫明細そのものが廃止の場合は引き続き対象外です。"}
            </p>

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
              <input
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
                disabled={submitting}
                className={`rounded-xl px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 ${
                  bulkOperation === "ARCHIVE"
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
