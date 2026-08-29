"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";

type SystemBarcodeLabelProps = {
  itemId: string;
  itemName: string;
  janCode: string | null;
  initialSystemJan: string | null;
};

type IssueResponse = {
  success?: boolean;
  item?: {
    systemBarcode?: string | null;
  };
  message?: string;
};

type PrintLayout = "A4" | "LABEL";

function barcodeFormat(value: string): "EAN13" | "EAN8" | "CODE128" {
  if (/^\d{13}$/.test(value)) {
    return "EAN13";
  }

  if (/^\d{8}$/.test(value)) {
    return "EAN8";
  }

  return "CODE128";
}

function readMessage(data: unknown, fallback: string) {
  if (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return fallback;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function SystemBarcodeLabel({
  itemId,
  itemName,
  janCode,
  initialSystemJan,
}: SystemBarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [systemJan, setSystemJan] = useState(initialSystemJan);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState("");
  const [printLayout, setPrintLayout] = useState<PrintLayout>("A4");
  const [printCopies, setPrintCopies] = useState(1);

  const barcode = janCode || systemJan;
  const barcodeTitle = janCode ? "既存JANコード" : "システムJAN";

  useEffect(() => {
    setSystemJan(initialSystemJan);
  }, [initialSystemJan]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        const text = await response.text();

        let data: unknown = null;

        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }

        if (
          response.ok &&
          typeof data === "object" &&
          data !== null &&
          "role" in data &&
          data.role === "ADMIN"
        ) {
          setIsAdmin(true);
        }
      } finally {
        setCheckingRole(false);
      }
    };

    void loadUser();
  }, []);

  useEffect(() => {
    if (!barcode || !svgRef.current) {
      return;
    }

    try {
      JsBarcode(svgRef.current, barcode, {
        format: barcodeFormat(barcode),
        width: 2,
        height: 76,
        displayValue: true,
        fontSize: 15,
        margin: 8,
        background: "#ffffff",
        lineColor: "#111827",
      });
    } catch {
      setMessage("バーコードを表示できませんでした。");
    }
  }, [barcode]);

  const issueSystemJan = async () => {
    if (janCode) {
      setMessage("既存JANコードがあるため、システムJANは発行しません。");
      return;
    }

    setIssuing(true);
    setMessage("");

    try {
      const response = await fetch("/api/items/system-barcode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId,
        }),
      });

      const text = await response.text();

      let data: unknown = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error("システムJANの応答を確認できませんでした。");
      }

      if (!response.ok) {
        throw new Error(
          readMessage(data, "システムJANを発行できませんでした。")
        );
      }

      const result = data as IssueResponse;
      const nextSystemJan = result.item?.systemBarcode ?? null;

      if (!nextSystemJan) {
        throw new Error("システムJANを確認できませんでした。");
      }

      setSystemJan(nextSystemJan);
      setMessage(
        "システムJANを発行しました。ラベルを印刷して商品または保管ケースへ貼り付けてください。"
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "システムJANを発行できませんでした。"
      );
    } finally {
      setIssuing(false);
    }
  };

  const printLabel = () => {
    if (!barcode || !svgRef.current) {
      return;
    }

    const copies = Math.min(Math.max(Math.trunc(printCopies), 1), 100);
    const labelHtml = `
      <section class="label">
        <p class="system">INVENTORY OS / ${barcodeTitle}</p>
        <p class="name">${escapeHtml(itemName)}</p>
        <p class="code">${escapeHtml(barcode)}</p>
        ${svgRef.current.outerHTML}
      </section>
    `;
    const labels = Array.from({ length: copies }, () => labelHtml).join("");
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
          <title>${escapeHtml(itemName)} ラベル</title>
          <style>
            @page {
              size: ${printLayout === "A4" ? "A4 portrait" : "62mm 32mm"};
              margin: ${printLayout === "A4" ? "8mm" : "0"};
            }

            * { box-sizing: border-box; }

            body {
              margin: 0;
              color: #111827;
              font-family: Arial, "Noto Sans JP", sans-serif;
              ${printLayout === "A4" ? "display:grid;grid-template-columns:repeat(3,62mm);grid-auto-rows:32mm;gap:2mm;" : ""}
            }

            .label {
              width: 62mm;
              height: 32mm;
              overflow: hidden;
              border: 0.25mm dashed #94a3b8;
              padding: 2mm;
              break-inside: avoid;
              page-break-inside: avoid;
            }

            ${printLayout === "A4" ? ".label:nth-child(24n){break-after:page;page-break-after:always;}" : ".label{break-after:page;page-break-after:always;}.label:last-child{break-after:auto;page-break-after:auto;}"}

            .system {
              margin: 0;
              color: #475569;
              font-size: 6pt;
              font-weight: 700;
            }

            .name {
              margin: 1mm 0;
              max-height: 6mm;
              overflow: hidden;
              font-size: 8.5pt;
              font-weight: 800;
              word-break: break-word;
            }

            .code {
              margin: 0 0 2mm;
              font-family: monospace;
              font-size: 7pt;
              font-weight: 700;
            }

            svg {
              display: block;
              width: 100%;
              height: 15mm;
            }

            @media print {
              body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          ${labels}

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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-500">
            バーコード・ラベル
          </p>

          <h2 className="mt-1 text-xl font-black text-slate-900">
            {barcode ? barcodeTitle : "JANコード未登録"}
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {janCode
              ? "商品に登録済みのJANコードをそのまま使います。"
              : systemJan
                ? "JANコードがない商品のため、Inventory OSが発行したシステムJANです。"
                : "JANコードがない商品です。管理者はシステムJANを発行できます。"}
          </p>
        </div>

        {barcode ? (
          <button
            type="button"
            onClick={printLabel}
            className="rounded-xl bg-slate-800 px-4 py-3 font-bold text-white hover:bg-slate-950"
          >
            ラベルを印刷
          </button>
        ) : isAdmin ? (
          <button
            type="button"
            onClick={() => void issueSystemJan()}
            disabled={issuing || checkingRole}
            className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700 disabled:bg-slate-400"
          >
            {issuing ? "発行中…" : "システムJANを発行"}
          </button>
        ) : (
          <span className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">
            管理者のみ発行可能
          </span>
        )}
      </div>

      {message && (
        <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
          {message}
        </p>
      )}

      {barcode && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">
              印刷用紙
              <select
                value={printLayout}
                onChange={(event) => setPrintLayout(event.target.value as PrintLayout)}
                className="mt-1 w-full rounded-lg border bg-white p-2"
              >
                <option value="A4">A4・小型24枚配置（62×32mm）</option>
                <option value="LABEL">ラベルプリンター・62×32mm</option>
              </select>
            </label>
            <label className="text-sm font-bold text-slate-700">
              印刷枚数
              <input
                type="number"
                min="1"
                max="100"
                value={printCopies}
                onChange={(event) => setPrintCopies(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border bg-white p-2"
              />
            </label>
          </div>
          <p className="mb-2 text-center text-sm font-bold text-slate-600">
            {barcodeTitle}
          </p>

          <p className="mb-2 break-all text-center font-mono text-sm font-bold text-slate-800">
            {barcode}
          </p>

          <div className="flex justify-center overflow-x-auto rounded-lg bg-white p-2">
            <svg ref={svgRef} />
          </div>
        </div>
      )}
    </section>
  );
}
