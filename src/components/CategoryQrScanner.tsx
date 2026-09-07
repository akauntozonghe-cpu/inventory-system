"use client";
import { useRef, useState } from "react";
import BarcodeCamera from "./stocktake/BarcodeCamera";
import { resolveScan } from "@/lib/resolve-scan";
export default function CategoryQrScanner({ onDetected, onClose }: { onDetected: (category: string) => void; onClose: () => void }) {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <BarcodeCamera title="大分類QRを読み取る" closeOnDetect={false} paused={busy} onClose={onClose} onDetected={raw => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    void resolveScan(raw).then(scanned => {
      if (scanned.type === "CLASSIFICATION" && scanned.name) onDetected(scanned.name);
      else if (scanned.type === "ITEM" && scanned.code && !/^\d+$/.test(scanned.code)) onDetected(scanned.code);
      else setError("大分類QRを読み取ってください。商品や保管場所のラベルは通常の読取ボタンで使えます。");
    }).catch(() => setError("大分類を確認できませんでした。通信とラベルの登録内容を確認して、もう一度読み取ってください。"))
      .finally(() => { busyRef.current = false; setBusy(false); });
  }}>{error && <p role="alert" className="rounded-xl bg-white p-4 text-red-700">{error}</p>}</BarcodeCamera>;
}
