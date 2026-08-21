"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import JsBarcode from "jsbarcode";
import type { Item } from "./types";

type Props = {
  items: Item[];
  reload: () => void | Promise<void>;
  onEdit: (item: Item) => void;
};

type CurrentUser = {
  id: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
};

type BulkOperation = "ARCHIVE" | "RESTORE";

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

function barcodeFormat(value: string): "EAN13" | "EAN8" | "CODE128" {
  if (/^\d{13}$/.test(value)) {
    return "EAN13";
  }

  if (/^\d{8}$/.test(value)) {
    return "EAN8";
  }

  return "CODE128";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createBarcodeSvg(value: string) {
  const svg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );

  JsBarcode(svg, value, {
    format: barcodeFormat(value),
    width: 1.8,
    height: 56,
    displayValue: true,
    fontSize: 13,
    margin: 5,
    background: "#ffffff",
    lineColor: "#111827",
  });

  return new XMLSerializer().serializeToString(svg);
}

export default function ItemTable({ items, reload, onEdit }: Props) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [bulkOperation, setBulkOperation] = useState<BulkOperation | null>(
    null
  );
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = currentUser?.role === "ADMIN";

  useEffect(() => {
    let active = true;

    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        const data = await readJson(response);

        if (
          !response.ok ||
          !data ||
          typeof data !== "object" ||
          !("role" in data) ||
          !("id" in data) ||
          !("displayName" in data)
        ) {
          return;
        }

        const user = data as CurrentUser;

        if (active && (user.role === "ADMIN" || user.role === "WORKER")) {
          setCurrentUser(user);
        }
      } catch {
        // 権限不明時は安全側に倒し、管理者用操作を表示しない
      }
    };

    void loadUser();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => items.some((item) => item.id === id))
    );
  }, [items]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds]
  );

  const printableItems = useMemo(
    () =>
      items.filter((item) => Boolean(item.janCode || item.systemBarcode)),
    [items]
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
      setError("廃止・復元の理由を2文字以上で入力してください。");
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
        bulkOperation === "ARCHIVE" ? "廃止として保管" : "復元";

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

  const printSelected = () => {
    setMessage("");
    setError("");

    const targets =
      selectedItems.length > 0
        ? selectedItems
        : printableItems;

    const labels = targets
      .filter((item) => Boolean(item.janCode || item.systemBarcode))
      .map((item) => {
        const barcode = item.janCode || item.systemBarcode;

        if (!barcode) {
          return "";
        }

        const barcodeKind = item.janCode ? "JANコード" : "システムバーコード";
        const category =
          [item.majorCategory, item.minorCategory]
            .filter(Boolean)
            .join(" / ") || "分類未設定";

        return `
          <article class="label">
            <p class="caption">INVENTORY OS / ${barcodeKind}</p>
            <h1>${escapeHtml(item.name)}</h1>
            <p class="category">${escapeHtml(category)}</p>
            <p class="code">${escapeHtml(barcode)}</p>
            <div class="barcode">${createBarcodeSvg(barcode)}</div>
          </article>
        `;
      })
      .join("");

    if (!labels) {
      setError(
        "印刷できるJANコードまたはシステムバーコードを持つ商品がありません。"
      );
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) {
      setError(
        "印刷画面を開けませんでした。ブラウザのポップアップ許可を確認してください。"
      );
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html lang="ja">
        <head>
          <meta charset="utf-8" />
          <title>商品バーコードラベル</title>
          <style>
            @page { size: A4; margin: 8mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #111827;
              font-family: Arial, "Noto Sans JP", sans-serif;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 4mm;
            }
            .label {
              min-height: 45mm;
              padding: 4mm;
              border: 1px solid #cbd5e1;
              border-radius: 3mm;
              break-inside: avoid;
            }
            .caption {
              margin: 0;
              color: #475569;
              font-size: 8pt;
              font-weight: 700;
            }
            h1 {
              margin: 2mm 0 1mm;
              font-size: 13pt;
              line-height: 1.3;
              word-break: break-word;
            }
            .category {
              margin: 0;
              color: #475569;
              font-size: 8pt;
            }
            .code {
              margin: 2mm 0 0;
              font-family: monospace;
              font-size: 8pt;
              font-weight: 700;
            }
            .barcode {
              margin-top: 1mm;
              text-align: center;
            }
            svg {
              display: inline-block;
              max-width: 100%;
              height: auto;
            }
          </style>
        </head>
        <body>
          <main class="grid">${labels}</main>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

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
      <section className="space-y-4">
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
                この一覧の商品をすべて選択
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
                disabled={printableItems.length === 0}
                className="rounded-xl bg-slate-800 px-4 py-3 font-bold text-white transition hover:bg-slate-950 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {selectedItems.length > 0
                  ? `選択した${selectedItems.length}件を印刷`
                  : "表示中のラベルを印刷"}
              </button>

              {isAdmin && (
                <>
                  <button
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

        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const barcode = item.janCode || item.systemBarcode;
            const category =
              [item.majorCategory, item.minorCategory]
                .filter(Boolean)
                .join(" / ") || "-";

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
                      checked={selectedIds.includes(item.id)}
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

                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                          {item.janCode
                            ? "JAN"
                            : item.systemBarcode
                              ? "システムバーコード"
                              : "識別コード未設定"}
                        </span>
                      </div>
                    </div>

                    <p className="mt-3 break-all font-mono text-sm font-bold text-slate-700">
                      {barcode ?? "-"}
                    </p>

                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
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
                        <dt className="font-bold text-slate-500">管理番号</dt>
                        <dd className="mt-1 text-slate-800">
                          {item.managementCode ?? "-"}
                        </dd>
                      </div>

                      <div>
                        <dt className="font-bold text-slate-500">基本単位</dt>
                        <dd className="mt-1 text-slate-800">
                          {item.defaultUnit ?? "-"}
                        </dd>
                      </div>
                    </dl>

                    {item.isArchived && item.archiveReason && (
                      <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        廃止理由：{item.archiveReason}
                      </p>
                    )}

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        href={`/items/${item.id}`}
                        className="rounded-xl bg-sky-600 px-4 py-2 font-bold text-white transition hover:bg-sky-700"
                      >
                        詳細
                      </Link>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => onEdit(item)}
                          className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-white transition hover:bg-amber-600"
                        >
                          編集
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {bulkOperation && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
        >
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

            <h2 className="mt-2 text-2xl font-black text-slate-900">
              {bulkOperation === "ARCHIVE"
                ? "選択商品を廃止しますか？"
                : "選択商品を復元しますか？"}
            </h2>

            <p className="mt-3 text-slate-600">
              対象：{selectedItems.length}件
              {bulkOperation === "ARCHIVE"
                ? "。在庫・棚卸履歴は残したまま、通常の一覧から非表示にします。"
                : "。通常の商品一覧と棚卸対象に戻します。"}
            </p>

            <label className="mt-5 block">
              <span className="font-bold text-slate-800">
                {bulkOperation === "ARCHIVE" ? "廃止理由" : "復元理由"}
              </span>

              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="例：終売のため、再取扱い開始のため"
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
                  : bulkOperation === "ARCHIVE"
                    ? "廃止を確定"
                    : "復元を確定"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}