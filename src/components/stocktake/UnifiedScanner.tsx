"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import BarcodeCamera from "./BarcodeCamera";
import { parseScan } from "@/lib/scan-payload";
import { resolveScan } from "@/lib/resolve-scan";

type Props = {
  onProduct: (code: string) => void | boolean | Promise<void | boolean>;
  onMinorCategory?: (name:string,parentName:string)=>void|Promise<void>;
  onCategory: (name: string) => void | Promise<void>;
  onLocation?: (location: { id: string; name: string }) => void | Promise<void>;
  onClose: () => void;
  continuous?: boolean;
  paused?: boolean;
  children?: ReactNode;
  title?: string;
  notice?: string;
  pauseMessage?: string;
};

// Own recognition, payload resolution, duplicate/in-flight protection and errors here.
// Pages only supply the action to take for a product or category.
export default function UnifiedScanner({ onProduct, onCategory, onMinorCategory, onLocation, onClose, continuous = false, paused = false, children, title, notice, pauseMessage }: Props) {
  const active = useRef(true);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const close = () => { active.current = false; onClose(); };
  const detect = async (raw: string) => {
    if (locked.current || paused || !active.current) return;
    locked.current = true; setBusy(true); setError("");
    try {
      if (continuous && parseScan(raw).type !== "ITEM") return;
      const scanned = await resolveScan(raw);
      if (!active.current) return;
      if (scanned.type === "CLASSIFICATION" && scanned.name) {if(scanned.kind==="MINOR"){if(!onMinorCategory){setError("SCAN_QR_UNSUPPORTED：この画面は小分類QRには対応していません。");return;}await onMinorCategory(scanned.name,scanned.parentName??"");}else await onCategory(scanned.name); }
      else if (scanned.type === "ITEM" && scanned.code) {if(await onProduct(scanned.code)===false)return;}
      else if (scanned.type === "LOCATION" && scanned.id && scanned.name && onLocation) await onLocation({ id: scanned.id, name: scanned.name });
      else { setError("SCAN_QR_UNSUPPORTED：このQRには対応していません。この画面で使う商品・分類のラベルを読み取ってください。"); return; }
      if (active.current && !continuous) close();
    } catch (error) {
      if(error instanceof Error&&raw.trim().startsWith("{"))error=new Error(error.message.replace("このJAN・商品コード","このQRの商品"));
      if (active.current) setError(error instanceof Error && /^[A-Z_]+：/.test(error.message)?error.message:"SCAN_RESOLVE_FAILED：読み取ったラベルを確認できませんでした。通信とラベルの登録内容を確認して、もう一度読み取ってください。");
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  };
  return <BarcodeCamera continuous={continuous} pauseMessage={busy ? "商品・ラベルを確認しています…" : (pauseMessage??"数量入力中です。保存すると読取を再開します。")} includeQr={!continuous} title={title ?? (continuous ? "JANを連続で読み取る" : "JAN・QRを読み取る")} notice={notice ?? (continuous ? "JAN・商品バーコード専用です。数量を保存して次の商品へ進みます。大分類QRは通常の読取で使ってください。" : "JANは商品検索、大分類QRは分類の絞り込みに使います。QR全体を枠内に入れてください。")} closeOnDetect={false} paused={paused || busy} onClose={close} onDetected={raw => void detect(raw)}>
    {busy && <p role="status" className="rounded-xl bg-white p-4 font-bold text-slate-900">読み取った内容を確認しています…</p>}
    {error && <p role="alert" className="rounded-xl bg-white p-4 font-bold text-red-700">{error}</p>}
    {children}
  </BarcodeCamera>;
}
