"use client";
import ImeInput from "@/components/common/ImeInput";
import { useEffect, useMemo, useState } from "react";
import {compareLabels} from "@/lib/natural-label-order";
import {selectActiveMasters} from "@/lib/active-master-catalog";
import dynamic from "next/dynamic";
import type { PrintLabel } from "./LabelPrintDialog";
const PRINT_WORKSPACE_KEY = "inventory:label-print-workspace:v1";
const LabelPrintDialog = dynamic(() => import("./LabelPrintDialog"), { ssr: false });
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
        retiredAt?: string | null;
        retiredViaParent?: boolean;
    }>;
    locations: Array<{
        id: string;
        name: string;
        retiredAt?: string | null;
    }>;
};
export function classificationPrintLabel(row: LabelCatalog["classifications"][number]): PrintLabel { return { id: row.id, name: (row.kind === "MINOR" ? row.parentName + " ／ " : "") + row.name, kind: row.kind === "MINOR" ? "小分類" : "大分類", payload: JSON.stringify({ type: "INVENTORY_CLASSIFICATION_LABEL", classificationLabelCode: row.labelCode, kind: row.kind, majorCategory: row.kind === "MAJOR" ? row.name : row.parentName, minorCategory: row.kind === "MINOR" ? row.name : undefined, parentName: row.parentName }) }; }
export function locationPrintLabel(row: LabelCatalog["locations"][number]): PrintLabel { return { id: row.id, name: row.name, kind: "保管場所", payload: JSON.stringify({ type: "INVENTORY_LOCATION_LABEL", storageLocationId: row.id, storageLocationName: row.name }) }; }
/** The active category/location master is the only source of standard print candidates. */
export function activePrintCatalog(data:LabelCatalog):LabelCatalog {
    const masters=selectActiveMasters(data.classifications,data.locations);
    return {
        items:data.items,
        classifications:[...masters.majors,...masters.minors],
        locations:masters.locations,
    };
}
export default function LabelPrintPanel({ data, onRefresh }: {
    data: LabelCatalog;
    onRefresh: () => void | Promise<void>;
}) {
    const [limit, setLimit] = useState(100);
    const [kind, setKind] = useState("JAN"), [search, setSearch] = useState(""), [selected, setSelected] = useState<string[]>([]), [printing, setPrinting] = useState<string[] | null>(null);
    const [workspaceReady,setWorkspaceReady] = useState(false);
    useEffect(()=>{
      try {
        const raw=sessionStorage.getItem(PRINT_WORKSPACE_KEY);
        if(raw && raw.length<50000){
          const value:unknown=JSON.parse(raw);
          if(value && typeof value==="object"){
            const state=value as Record<string,unknown>;
            if(["JAN","MAJOR","MINOR","LOCATION"].includes(String(state.kind)))setKind(String(state.kind));
            if(typeof state.search==="string")setSearch(state.search.slice(0,250));
            if(Array.isArray(state.selected))setSelected([...new Set(state.selected.filter((id):id is string=>typeof id==="string"&&id.length<140))].slice(0,2000));
            if(Array.isArray(state.printing))setPrinting([...new Set(state.printing.filter((id):id is string=>typeof id==="string"&&id.length<140))].slice(0,2000));
            if(typeof state.limit==="number" && Number.isInteger(state.limit))setLimit(Math.max(100,Math.min(state.limit,2000)));
          }
        }
      }catch{/* Continue with an empty selection if browser storage is blocked. */}
      setWorkspaceReady(true);
    },[]);
    useEffect(()=>{
      if(!workspaceReady)return;
      try{sessionStorage.setItem(PRINT_WORKSPACE_KEY,JSON.stringify({kind,search,selected,printing,limit}));}catch{}
    },[workspaceReady,kind,search,selected,printing,limit]);

    const rows = useMemo<PrintLabel[]>(() => {
        const active=activePrintCatalog(data);
        return (kind === "JAN" ? active.items.map(row => ({ id: row.id, itemId: row.id, name: row.name, barcode: row.janCode || row.systemBarcode })) : kind === "LOCATION" ? active.locations.map(locationPrintLabel) : active.classifications.filter(row => row.kind === kind).map(classificationPrintLabel)).sort((a,b)=>compareLabels(a.name,b.name)||compareLabels(a.barcode??"",b.barcode??"")||compareLabels(a.id,b.id));
    }, [data, kind]);
    const availableIds=useMemo(()=>new Set(rows.map(row=>row.id)),[rows]);
    const validSelected=selected.filter(id=>availableIds.has(id));
    const validPrinting=printing?.filter(id=>availableIds.has(id))??null;
    const shown = rows.filter(row => (row.name + " " + (row.barcode ?? "")).normalize("NFKC").toLocaleLowerCase("ja").includes(search.normalize("NFKC").toLocaleLowerCase("ja")));
    const finish = () => { setSelected([]); setSearch(""); setPrinting(null); };
    return <section id="label-print" className="mt-6 scroll-mt-24 rounded-2xl border bg-white p-4"><h2 className="text-2xl font-black">JAN・QRラベルの印刷</h2><p className="my-2 text-sm">種類を選び、必要なラベルにチェックしてまとめて印刷します。</p><div className="my-3 flex flex-wrap gap-2">{[["JAN", "商品JAN"], ["MAJOR", "大分類QR"], ["MINOR", "小分類QR"], ["LOCATION", "保管場所QR"]].map(([id, label]) => <button key={id} aria-pressed={kind === id} onClick={() => { setKind(id); setLimit(100); setSelected([]); setSearch(""); }} className={`rounded-xl border px-4 py-3 font-bold ${kind === id ? "bg-blue-700 text-white" : "bg-white"}`}>{label}</button>)}</div>
 <ImeInput type="search" aria-label="印刷するラベルを絞り込む" value={search} onChange={event => { setSearch(event.target.value); setLimit(100); }} placeholder="名前・JANで絞り込む（すぐ反映）" className="w-full rounded-xl border p-3"/>
 <p role="status" className="my-2">表示 {shown.length}件 ／ 選択 {validSelected.length}件{validSelected.some(id => !shown.some(row => row.id === id)) ? "（表示外の選択を含みます）" : ""}</p><div className="my-3 flex flex-wrap gap-2"><button disabled={!shown.length} className="rounded-xl border p-3" onClick={() => setSelected(current => [...new Set([...current, ...shown.map(row => row.id)])])}>検索結果を全選択</button><button className="rounded-xl border p-3" onClick={finish}>選択・絞り込みをクリア</button><button disabled={!validSelected.length} className="rounded-xl bg-blue-700 p-3 font-bold text-white disabled:opacity-40" onClick={() => setPrinting([...validSelected])}>選択したラベルをまとめて印刷</button></div>
 <div className="max-h-80 space-y-2 overflow-auto">{shown.slice(0, limit).map(row => <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><label className="flex w-full min-w-0 cursor-pointer items-center gap-2"><ImeInput type="checkbox" checked={validSelected.includes(row.id)} onChange={event => setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))}/><span className="break-words font-bold">{row.name}<span className="block break-all text-xs font-normal">{row.barcode}</span></span></label></div>)}</div>
 {shown.length > limit && <button className="my-3 rounded-xl border p-3" onClick={() => setLimit(current => current + 100)}>続きの100件を表示</button>}
 {validPrinting && validPrinting.length>0 && <LabelPrintDialog labels={rows.filter(row => validPrinting.includes(row.id))} canEdit onClose={() => setPrinting(null)} onComplete={finish}/> }
 </section>;
}
