"use client";

import { useEffect, useRef, useState } from "react";
import LabelPrintDialog from "@/components/LabelPrintDialog";
import { barcodeLabel } from "@/lib/barcode-label";

type SystemBarcodeLabelProps = {
  itemId: string;
  itemName: string;
  janCode: string | null;
  initialSystemJan: string | null;
  onUpdated?:()=>void|Promise<void>;
};

type IssueResponse = {
  success?: boolean;
  item?: {
    systemBarcode?: string | null;
  };
  message?: string;
};



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
  onUpdated,
}: SystemBarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [systemJan, setSystemJan] = useState(initialSystemJan);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState("");
  const [printOpen,setPrintOpen]=useState(false);
  const scale=0.8;
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
      setBarcodeError(`商品「${itemName}」：${error instanceof Error ? error.message : "バーコードを表示できませんでした。"}`);
    }
  }, [barcode, scale, itemName]);

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

  const printLabel = () => setPrintOpen(true);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      {printOpen&&<LabelPrintDialog labels={[{id:itemId,itemId,name:itemName,barcode}]} canEdit={isAdmin} onClose={()=>setPrintOpen(false)} onRefresh={onUpdated}/>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-500">
            バーコード・ラベル
          </p>

          <h2 className="mt-1 text-xl font-black text-slate-900">
            {barcode ? barcodeTitle : "印刷するJANの準備"}
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

      {barcodeError && <p role="alert" className="mt-4 font-bold text-red-700">{barcodeError}</p>}
      {message && (
        <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
          {message}
        </p>
      )}

      {barcode && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm">80%の小型寸法です。印刷画面で枚数・用紙・商品名の有無を選べます。画面上のmm表示は端末により実寸と異なるため、印刷時は100%で確認してください。</p>
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
