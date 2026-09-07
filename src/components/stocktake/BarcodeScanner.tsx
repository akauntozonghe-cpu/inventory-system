"use client";
import { useState } from "react";
import BarcodeCamera from "./BarcodeCamera";
export default function BarcodeScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-green-700 px-5 py-3 font-bold text-white">JAN・QRを読み取る</button>
    {open && <BarcodeCamera onClose={() => setOpen(false)} onDetected={code => { setOpen(false); onDetected(code); }} />}</>;
}
