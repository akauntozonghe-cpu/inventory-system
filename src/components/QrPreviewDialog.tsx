"use client";
import { useEffect, useState } from "react";
import Modal from "./common/Modal";
import type { PrintLabel } from "./LabelPrintDialog";

export default function QrPreviewDialog({ label, onClose, onPrint }: { label: PrintLabel; onClose: () => void; onPrint: () => void }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (!label.payload) return;
    void import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(label.payload!, { width: 520, margin: 4, errorCorrectionLevel: "M" })).then(value => { if (!cancelled) setImage(value); });
    return () => { cancelled = true; };
  }, [label.payload]);
  return <Modal titleId="qr-preview-title" onClose={onClose}>
    <h2 id="qr-preview-title" className="text-2xl font-black">QRを表示</h2>
    <p className="mt-2 text-sm text-slate-600">このQRを読み取ると、対象の{label.kind ?? "分類・保管場所"}を呼び出せます。</p>
    <div className="mt-4 rounded-2xl border bg-white p-4 text-center"><p className="font-black">{label.name}</p>{image ? <img src={image} alt={`${label.name}のQRコード`} className="mx-auto mt-3 h-64 w-64" /> : <p role="status" className="p-16">QRを準備しています…</p>}</div>
    <details className="mt-3 rounded-xl border p-3"><summary className="cursor-pointer font-bold">QRの用途</summary><p className="mt-2 text-sm">大分類・小分類QRは棚卸範囲や分類検索、保管場所QRはその場所の在庫検索や棚卸範囲の指定に使います。読み取るだけで在庫は移動しません。</p></details>
    <div className="mt-4 flex gap-2"><button type="button" onClick={onPrint} className="min-h-11 rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white">このQRを印刷</button><button type="button" onClick={onClose} className="min-h-11 rounded-xl border px-4 py-3 font-bold">閉じる</button></div>
  </Modal>;
}
