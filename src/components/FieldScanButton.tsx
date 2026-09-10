"use client";
import { useState } from "react";
import { Camera } from "lucide-react";
import UnifiedScanner from "./stocktake/UnifiedScanner";
import { barcodeLabel } from "@/lib/barcode-label";
export type FieldScanValue = {
    kind: "JAN" | "MAJOR" | "MINOR" | "LOCATION";
    value: string;
    parentName?: string;
    id?: string;
};
export default function FieldScanButton({ kind, onRead, disabled = false }: {
    kind: FieldScanValue["kind"] | "SCOPE";
    onRead: (value: FieldScanValue) => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const label = kind === "JAN" ? "JAN" : kind === "MAJOR" ? "大分類QR" : kind === "MINOR" ? "小分類QR" : kind === "LOCATION" ? "保管場所QR" : "棚卸範囲のQR";
    const unsupported = (type: string) => { throw new Error("SCAN_UNSUPPORTED：この" + type + "には対応していません。" + label + "を読み取ってください。"); };
    return <><button type="button" disabled={disabled} aria-label={label + "をカメラで読み取る"} title={label + "を読み取って入力"} onClick={() => setOpen(true)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-indigo-700 disabled:opacity-40"><Camera size={22}/></button>{open && <UnifiedScanner title={label + "を読み取って入力"} notice="読み取った内容を入力します。保存・棚卸開始は、内容を確認してから行ってください。" onProduct={code => { if (kind !== "JAN")
        return unsupported("JAN"); if (!/^\d{8}$|^\d{13}$/.test(code))
        return unsupported("コード"); try {
        barcodeLabel(code);
    }
    catch {
        throw new Error("SCAN_JAN_INVALID：このJANの数字を確認できません。商品に印字された数字を確認してください。");
    } onRead({ kind: "JAN", value: code }); }} onCategory={name => { if (kind !== "MAJOR" && kind !== "SCOPE")
        return unsupported("大分類QR"); onRead({ kind: "MAJOR", value: name }); }} onMinorCategory={(name, parentName) => { if (kind !== "MINOR")
        return unsupported("小分類QR"); onRead({ kind: "MINOR", value: name, parentName }); }} onLocation={place => { if (kind !== "LOCATION" && kind !== "SCOPE")
        return unsupported("保管場所QR"); onRead({ kind: "LOCATION", value: place.name, id: place.id }); }} onClose={() => setOpen(false)}/>}</>;
}
