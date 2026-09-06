"use client";

import { useEffect, useRef, useState } from "react";
import { barcodeLabel, barcodePrintDocument, type LabelScale } from "@/lib/barcode-label";

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
  const [scale, setScale] = useState<LabelScale>(0.8);
  const [barcodeError, setBarcodeError] = useState("");

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
      const rendered = barcodeLabel(barcode, scale);
      const parsed = new DOMParser().parseFromString(rendered.svg, "image/svg+xml").documentElement;
      svgRef.current.replaceChildren(...Array.from(parsed.childNodes));
      for (const attribute of Array.from(parsed.attributes)) svgRef.current.setAttribute(attribute.name, attribute.value);
      setBarcodeError("");
    } catch (error) {
      svgRef.current.replaceChildren();
      setBarcodeError(error instanceof Error ? error.message : "バーコードを表示できませんでした。");
    }
  }, [barcode, scale]);

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

    try {
      const copies = Number.isFinite(printCopies) ? Math.min(Math.max(Math.trunc(printCopies), 1), 100) : 1;
      const html = barcodePrintDocument(Array.from({ length: copies }, () => ({ name: itemName, barcode })), printLayout, scale);
      const printWindow = window.open("", "_blank", "width=900,height=700");
      if (!printWindow) throw new Error("印刷画面を開けませんでした。ポップアップを許可してください。");
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (error) { setMessage(error instanceof Error ? error.message : "ラベルを作成できませんでした。"); }
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
            disabled={Boolean(barcodeError)}
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

      {barcodeError && <p role="alert" className="mt-4 font-bold text-red-700">{barcodeError}</p>}
      {message && (
        <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
          {message}
        </p>
      )}

      {barcode && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="mb-3 block text-sm font-bold">ラベルサイズ
            <select value={scale} onChange={(event) => setScale(Number(event.target.value) as LabelScale)} className="ml-3 rounded-lg border p-2">
              <option value={0.8}>小型 36×26mm（JAN 80%）</option><option value={1}>標準 42×32mm（JAN 100%）</option>
            </select>
          </label>
          <p className="mb-3 text-sm">JANは規定の余白・高さで印刷します。旧SYSコードは内容に応じて横幅が広がります。</p>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">
              印刷用紙
              <select
                value={printLayout}
                onChange={(event) => setPrintLayout(event.target.value as PrintLayout)}
                className="mt-1 w-full rounded-lg border bg-white p-2"
              >
                <option value="A4">A4・小型ラベル</option>
                <option value="LABEL">ラベルプリンター</option>
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
