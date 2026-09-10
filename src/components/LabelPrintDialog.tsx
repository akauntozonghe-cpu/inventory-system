"use client";
import { useMemo, useState } from "react";
import Modal from "./common/Modal";
import BarcodePrintOptions from "./BarcodePrintOptions";
import ProductEditDialog from "./ProductEditDialog";
import { barcodeLabel, barcodePrintDocument, type LabelScale, type LabelProfile } from "@/lib/barcode-label";
import { qrPrintDocument } from "@/lib/qr-print";
export type PrintLabel = {
    id: string;
    name: string;
    barcode?: string | null;
    payload?: string;
    kind?: "大分類" | "小分類" | "保管場所";
    itemId?: string;
};
export default function LabelPrintDialog({ labels, onClose, onComplete, onRefresh, canEdit = false }: {
    labels: PrintLabel[];
    onClose: () => void;
    onComplete?: () => void;
    onRefresh?: () => void | Promise<void>;
    canEdit?: boolean;
}) {
    const [profile,setProfile]=useState<LabelProfile>("COMPACT");
    const [scale, setScale] = useState<LabelScale>(0.8), [includeName, setIncludeName] = useState(false), [copies, setCopies] = useState(1);
    const [layout, setLayout] = useState<"A4" | "LABEL">("A4"), [excluded, setExcluded] = useState<string[]>([]);
    const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [opened, setOpened] = useState(false), [editing, setEditing] = useState<string | null>(null);
    const targets = labels.filter(row => !excluded.includes(row.id));
    const qr = labels.some(row => row.payload);
    const errors = useMemo(() => new Map(labels.flatMap(row => { if (row.payload)
        return []; try {
        barcodeLabel(row.barcode ?? "", scale);
        return [];
    }
    catch (error) {
        return [[row.id, error instanceof Error ? error.message : "印刷データを作れません"] as const];
    } })), [labels, scale]);
    const sample=useMemo(()=>{const row=targets.find(row=>!row.payload&&!errors.has(row.id));return row?{name:row.name,...barcodeLabel(row.barcode??"",scale,profile)}:null;},[targets,errors,scale,profile]);
    const invalid = targets.some(row => errors.has(row.id));
    async function refreshAfterEdit() {
        setEditing(null);
        setOpened(false);
        setBusy(true);
        try {
            await onRefresh?.();
            setMessage("商品を更新しました。最新のコードを確認してから印刷してください。");
        }
        catch {
            setMessage("商品は保存しましたが、印刷用の再取得に失敗しました。いったん印刷画面を閉じて開き直してください。");
        }
        finally {
            setBusy(false);
        }
    }
    async function preview() {
        if (busy || invalid || !targets.length)
            return;
        const printWindow = window.open("", "_blank", "width=900,height=700");
        if (!printWindow) {
            setMessage("印刷画面が開けません。ブラウザでポップアップを許可してから、もう一度押してください。");
            return;
        }
        printWindow.document.write('<!doctype html><html lang="ja"><title>印刷準備</title><body>選択したラベルを準備しています…</body></html>');
        setBusy(true);
        setMessage("");
        try {
            const permission=await fetch("/api/print/authorize",{cache:"no-store"});if(!permission.ok){const result=await permission.json();throw new Error(result.message??"印刷の権限を確認できませんでした。");}
        const repeat = Math.max(1, Math.min(100, Math.trunc(copies)));
            if (targets.length * repeat > 1000)
                throw new Error("1回の印刷は1000枚までです。商品数または枚数を減らしてください。");
            let html: string;
            if (qr) {
                const QRCode = (await import("qrcode")).default;
                const rendered = await Promise.all(targets.map(async (row) => ({ name: row.name, kind: row.kind, image: await QRCode.toDataURL(row.payload!, { width: 600, margin: 4, errorCorrectionLevel: "M" }) })));
                html = qrPrintDocument(rendered.flatMap(row => Array.from({ length: repeat }, () => row)));
            }
            else
                html = barcodePrintDocument(targets.flatMap(row => Array.from({ length: repeat }, () => ({ name: row.name, barcode: row.barcode! }))), layout, scale, includeName, profile);
            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
            setOpened(true);
            setMessage(`${targets.length * repeat}枚の印刷画面を開きました。倍率100%・実際のサイズで、まず1枚を試し印刷してください。`);
        }
        catch (error) {
            printWindow.close();
            setMessage(error instanceof Error ? error.message : "印刷の準備に失敗しました。選択は残しています。");
        }
        finally {
            setBusy(false);
        }
    }
    return <Modal titleId="label-print-title" busy={busy} onClose={onClose}>
    <h2 id="label-print-title" className="text-2xl font-black">{qr ? "QRラベル" : "商品JANラベル"}を印刷</h2>
    <p className="my-2 text-sm">1. 対象を確認 → 2. 枚数・用紙を選ぶ → 3. 印刷画面を開く</p>
    {qr ? <p className="my-3 rounded-xl bg-blue-50 p-3 text-sm">大分類QRは箱に貼って分類で絞り込み、保管場所QRは棚に貼ってその場所の在庫を表示します。読み取るだけでは在庫の移動・数量変更は行いません。QRは50mm角、ラベルは60×70mmです。</p> : <BarcodePrintOptions profile={profile} onProfile={setProfile} scale={scale} onScale={setScale} includeName={includeName} onIncludeName={setIncludeName}/>}
    <div className="my-3 flex flex-wrap gap-3"><label className="font-bold">各ラベルの枚数<input aria-label="各ラベルの枚数" type="number" min={1} max={100} value={copies} onChange={event => setCopies(Number(event.target.value))} className="ml-2 w-20 rounded-lg border p-2"/></label>{!qr && <label>用紙<select value={layout} onChange={event => setLayout(event.target.value as "A4" | "LABEL")} className="ml-2 rounded-lg border p-2"><option value="A4">A4へまとめて配置</option><option value="LABEL">ラベルプリンター（1枚ずつ）</option></select></label>}</div>
    {sample&&<details className="my-3 rounded-xl border p-3"><summary className="cursor-pointer font-bold">JANの仕上がりを表示</summary><p className="my-2 text-sm">{sample.name} ／ {sample.width.toFixed(2)}×{sample.height.toFixed(2)}mm（画面の物理寸法は端末によって異なります）</p><div className="w-fit bg-white p-2" dangerouslySetInnerHTML={{__html:sample.svg}}/></details>}
    <p className="font-bold">選択 {targets.length}種類・合計 {targets.length * (Number.isFinite(copies) ? copies : 0)}枚</p>
    <div className="my-3 max-h-72 space-y-2 overflow-auto">{labels.map(row => <article key={row.id} className={`rounded-xl border p-3 ${errors.has(row.id) ? "border-red-300 bg-red-50" : ""}`}><label className="flex gap-3 font-bold"><input type="checkbox" checked={!excluded.includes(row.id)} onChange={event => setExcluded(current => event.target.checked ? current.filter(id => id !== row.id) : [...current, row.id])}/>{row.name}</label>{row.barcode && <p className="mt-1 break-all font-mono text-sm">{row.barcode}</p>}{errors.has(row.id) && <><p role="alert" className="mt-2 text-sm text-red-800">対象：「{row.name}」。{errors.get(row.id)} 今回印刷しない場合はチェックを外してください。</p>{canEdit && row.itemId && <button className="mt-2 rounded-lg border bg-white p-2 font-bold" onClick={() => setEditing(row.itemId!)}>「{row.name}」のコードを修正</button>}</>}</article>)}</div>
    {message && <p role="status" className="my-3 rounded-xl bg-blue-50 p-3">{message}</p>}
    <div className="flex flex-wrap gap-3"><button disabled={busy || invalid || !targets.length || !Number.isInteger(copies) || copies < 1 || copies > 100} onClick={() => void preview()} className="rounded-xl bg-blue-700 p-3 font-bold text-white disabled:opacity-40">{busy ? "ラベルを準備中…" : "この内容で印刷画面を開く"}</button>{opened && <button disabled={busy} className="rounded-xl bg-emerald-700 p-3 font-bold text-white" onClick={() => { onComplete?.(); onClose(); }}>印刷を終えて選択をクリア</button>}<button disabled={busy} onClick={onClose} className="rounded-xl border p-3 font-bold">印刷せず戻る</button></div>
    {editing && <ProductEditDialog itemId={editing} onClose={() => setEditing(null)} onSaved={() => void refreshAfterEdit()}/>}
  </Modal>;
}
