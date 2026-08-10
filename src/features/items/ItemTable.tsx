"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import JsBarcode from "jsbarcode";
import type { Item } from "./types";

type Props = {
  items: Item[];
  reload: () => void;
  onEdit: (item: Item) => void;
};

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
    height: 58,
    displayValue: true,
    fontSize: 13,
    margin: 5,
    background: "#ffffff",
    lineColor: "#111827",
  });

  return new XMLSerializer().serializeToString(svg);
}

export default function ItemTable({
  items,
  reload,
  onEdit,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const printableItems = useMemo(
    () => items.filter((item) => Boolean(item.janCode || item.systemBarcode)),
    [items]
  );

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds]
  );

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => items.some((item) => item.id === id))
    );
  }, [items]);

  const allSelected =
    printableItems.length > 0 &&
    printableItems.every((item) => selectedIds.includes(item.id));

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

    setSelectedIds(printableItems.map((item) => item.id));
  };

  const printSelected = () => {
    setMessage("");

    if (selectedItems.length === 0) {
      setMessage("印刷する商品を選んでください。");
      return;
    }

    const labels = selectedItems
      .map((item) => {
        const barcode = item.janCode || item.systemBarcode;

        if (!barcode) {
          return "";
        }

        const barcodeTitle = item.janCode
          ? "既存JANコード"
          : "システムJAN";

        const category =
          [item.majorCategory, item.minorCategory]
            .filter(Boolean)
            .join(" / ") || "分類未設定";

        return `
          <article class="label">
            <p class="caption">INVENTORY OS / ${barcodeTitle}</p>
            <h1>${escapeHtml(item.name)}</h1>
            <p class="category">${escapeHtml(category)}</p>
            <p class="code">${escapeHtml(barcode)}</p>
            <div class="barcode">${createBarcodeSvg(barcode)}</div>
          </article>
        `;
      })
      .join("");

    if (!labels) {
      setMessage(
        "印刷できるJANコードまたはシステムJANが登録された商品を選んでください。"
      );
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) {
      setMessage(
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
            @page {
              size: A4;
              margin: 8mm;
            }

            * {
              box-sizing: border-box;
            }

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

  const deleteItem = async (id: string, name: string) => {
    const approved = window.confirm(
      `「${name}」を削除しますか？\n在庫や棚卸履歴がある商品は削除できない場合があります。`
    );

    if (!approved) {
      return;
    }

    try {
      const response = await fetch(`/api/items?id=${id}`, {
        method: "DELETE",
      });

      const text = await response.text();

      let data: unknown = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        const errorMessage =
          typeof data === "object" &&
          data !== null &&
          "message" in data &&
          typeof data.message === "string"
            ? data.message
            : "商品を削除できませんでした。";

        throw new Error(errorMessage);
      }

      setSelectedIds((current) =>
        current.filter((selectedId) => selectedId !== id)
      );

      reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "商品を削除できませんでした。"
      );
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
        <p className="text-slate-500">該当する商品がありません。</p>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-3 font-bold text-slate-700">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={printableItems.length === 0}
              className="h-5 w-5"
            />
            印刷可能な商品をすべて選択
          </label>

          <button
            type="button"
            onClick={printSelected}
            disabled={selectedItems.length === 0}
            className="rounded-xl bg-slate-800 px-4 py-3 font-bold text-white hover:bg-slate-950 disabled:bg-slate-300"
          >
            選択した {selectedItems.length} 件をまとめて印刷
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-500">
          JANコードまたはシステムJANがある商品だけ、ラベル印刷の対象にできます。
        </p>

        {message && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {message}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const barcode = item.janCode || item.systemBarcode;

          const barcodeTitle = item.janCode
            ? "JAN"
            : item.systemBarcode
              ? "システムJAN"
              : "JAN未登録";

          const category =
            [item.majorCategory, item.minorCategory]
              .filter(Boolean)
              .join(" / ") || "-";

          return (
            <article
              key={item.id}
              className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  disabled={!barcode}
                  onChange={() => toggleItem(item.id)}
                  title={
                    barcode
                      ? "印刷対象に選択"
                      : "JANまたはシステムJANがないため印刷できません"
                  }
                  className="mt-1 h-5 w-5 shrink-0"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="break-words text-lg font-black text-slate-900">
                      {item.name}
                    </h2>

                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                        barcode
                          ? "bg-blue-100 text-blue-700"
                          : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {barcodeTitle}
                    </span>
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
                      <dt className="font-bold text-slate-500">
                        メーカー
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {item.manufacturer ?? "-"}
                      </dd>
                    </div>

                    <div>
                      <dt className="font-bold text-slate-500">
                        管理コード
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {item.managementCode ?? "-"}
                      </dd>
                    </div>

                    <div>
                      <dt className="font-bold text-slate-500">
                        基本単位
                      </dt>
                      <dd className="mt-1 text-slate-800">
                        {item.defaultUnit ?? "-"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      href={`/items/${item.id}`}
                      className="rounded-xl bg-sky-600 px-4 py-2 font-bold text-white hover:bg-sky-700"
                    >
                      詳細・印刷
                    </Link>

                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-white hover:bg-amber-600"
                    >
                      編集
                    </button>

                    <button
                      type="button"
                      onClick={() => void deleteItem(item.id, item.name)}
                      className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700"
                    >
                      削除
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}