"use client";
import { useMemo, useState } from "react";
import LabelPrintDialog, { type PrintLabel } from "./LabelPrintDialog";
export type LabelCatalog = {
    items: Array<{
        id: string;
        name: string;
        janCode: string | null;
        systemBarcode: string | null;
    }>;
    classifications: Array<{
        id: string;
        kind: string;
        name: string;
        parentName: string;
        labelCode?: string;
    }>;
    locations: Array<{
        id: string;
        name: string;
    }>;
};
export function classificationPrintLabel(row: LabelCatalog["classifications"][number]): PrintLabel { return { id: row.id, name: (row.kind === "MINOR" ? row.parentName + " ／ " : "") + row.name, kind: row.kind === "MINOR" ? "小分類" : "大分類", payload: JSON.stringify({ type: "INVENTORY_CLASSIFICATION_LABEL", classificationLabelCode: row.labelCode, kind: row.kind, majorCategory: row.kind === "MAJOR" ? row.name : row.parentName, minorCategory: row.kind === "MINOR" ? row.name : undefined, parentName: row.parentName }) }; }
export function locationPrintLabel(row: LabelCatalog["locations"][number]): PrintLabel { return { id: row.id, name: row.name, kind: "保管場所", payload: JSON.stringify({ type: "INVENTORY_LOCATION_LABEL", storageLocationId: row.id, storageLocationName: row.name }) }; }
export default function LabelPrintPanel({ data, onRefresh }: {
    data: LabelCatalog;
    onRefresh: () => void | Promise<void>;
}) {
    const [limit, setLimit] = useState(100);
    const [kind, setKind] = useState("JAN"), [search, setSearch] = useState(""), [selected, setSelected] = useState<string[]>([]), [printing, setPrinting] = useState<string[] | null>(null);
    const rows = useMemo<PrintLabel[]>(() => kind === "JAN" ? data.items.map(row => ({ id: row.id, itemId: row.id, name: row.name, barcode: row.janCode || row.systemBarcode })) : kind === "LOCATION" ? data.locations.map(locationPrintLabel) : data.classifications.filter(row => row.kind === kind).map(classificationPrintLabel), [data, kind]);
    const shown = rows.filter(row => (row.name + " " + (row.barcode ?? "")).normalize("NFKC").toLocaleLowerCase("ja").includes(search.normalize("NFKC").toLocaleLowerCase("ja")));
    const finish = () => { setSelected([]); setSearch(""); setPrinting(null); };
    return <section id="label-print" className="mt-6 scroll-mt-24 rounded-2xl border bg-white p-4"><h2 className="text-2xl font-black">JAN・QRラベルの印刷</h2><p className="my-2 text-sm">商品に貼るJAN、箱に貼る大分類QR、棚に貼る保管場所QRを、1種類ずつでもまとめても印刷できます。</p><div className="my-3 flex flex-wrap gap-2">{[["JAN", "商品JAN"], ["MAJOR", "大分類QR"], ["MINOR", "小分類QR"], ["LOCATION", "保管場所QR"]].map(([id, label]) => <button key={id} aria-pressed={kind === id} onClick={() => { setKind(id); setLimit(100); setSelected([]); setSearch(""); }} className={`rounded-xl border px-4 py-3 font-bold ${kind === id ? "bg-blue-700 text-white" : "bg-white"}`}>{label}</button>)}</div>
 <input type="search" aria-label="印刷するラベルを絞り込む" value={search} onChange={event => { setSearch(event.target.value); setLimit(100); }} placeholder="名前・JANで絞り込む（すぐ反映）" className="w-full rounded-xl border p-3"/>
 <p role="status" className="my-2">表示 {shown.length}件 ／ 選択 {selected.length}件{selected.some(id => !shown.some(row => row.id === id)) ? "（表示外の選択を含みます）" : ""}</p><div className="my-3 flex flex-wrap gap-2"><button disabled={!shown.length} className="rounded-xl border p-3" onClick={() => setSelected(shown.map(row => row.id))}>表示中を全選択</button><button className="rounded-xl border p-3" onClick={finish}>選択・絞り込みをクリア</button><button disabled={!selected.length} className="rounded-xl bg-blue-700 p-3 font-bold text-white disabled:opacity-40" onClick={() => setPrinting([...selected])}>選択したラベルをまとめて印刷</button></div>
 <div className="max-h-80 space-y-2 overflow-auto">{shown.slice(0, limit).map(row => <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><label className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={selected.includes(row.id)} onChange={event => setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))}/><span className="break-words font-bold">{row.name}<span className="block break-all text-xs font-normal">{row.barcode}</span></span></label><button className="shrink-0 rounded-lg border p-2 font-bold" onClick={() => setPrinting([row.id])}>個別印刷</button></div>)}</div>
 {shown.length > limit && <button className="my-3 rounded-xl border p-3" onClick={() => setLimit(current => current + 100)}>続きの100件を表示</button>}
 {printing && <LabelPrintDialog labels={rows.filter(row => printing.includes(row.id))} canEdit onRefresh={onRefresh} onClose={() => setPrinting(null)} onComplete={finish}/>}
 </section>;
}
