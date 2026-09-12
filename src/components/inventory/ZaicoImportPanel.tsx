"use client";

import Link from "@/components/auth/PermissionLink";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { MAX_ZAICO_ROWS, rowProblem, validJan, mapZaicoRows, type ZaicoRow, type ImportCandidate } from "@/lib/zaico-import";

type Preview = { rowNumber: number; row: ZaicoRow; status: string; reason: string };
type Pending = { id: string; row: ZaicoRow; reason: string; candidates: ImportCandidate[]; selected: boolean; mode: string; itemId: string };
type Recent = { id: string; row: ZaicoRow; originalRow: ZaicoRow; status: string; itemId: string | null; reason: string };
const labels: Record<string, string> = { CREATE: "新規登録", CREATED: "登録済み", LINK: "既存に紐付け", LINKED: "紐付け済み", PENDING: "確認待ち", SKIPPED: "追加なし" };
const inputClass = "mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm";

async function api(body?: unknown, cursor?: string) {
  const response = await fetch("/api/admin/import-zaico" + (cursor ? "?historyCursor=" + encodeURIComponent(cursor) : ""), body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "取り込みを確認できませんでした。");
  return result;
}

export default function ZaicoImportPanel() {
  const [rows, setRows] = useState<ZaicoRow[]>([]), [preview, setPreview] = useState<Preview[]>([]);
  const [pending, setPending] = useState<Pending[]>([]), [recent, setRecent] = useState<Recent[]>([]), [count, setCount] = useState(0);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState(""), [fileName, setFileName] = useState("");
  async function load() {
    const data = await api();
    setPending(data.pending.map((row: Pending) => ({ ...row, selected: false, mode: "AUTO", itemId: "" })));
    setRecent(data.recent); setHistoryCursor(data.nextHistoryCursor); setCount(data.count);
  }
  useEffect(() => { void load().catch(e => setError(e.message)); }, []);
  function update(id: string, change: Partial<Pending>) { setPending(values => values.map(row => row.id === id ? { ...row, ...change } : row)); }
  async function read(file: File) {
    setBusy(true); setError(""); setNotice(""); setRows([]); setPreview([]); setFileName(file.name);
    try {
      if (file.size > 10_000_000) throw new Error("ファイルは10MB以内に分けてください。");
      const buffer = await file.arrayBuffer();
      let workbook: XLSX.WorkBook;
      if (/\.csv$/i.test(file.name)) {
        let csv: string;
        try { csv = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
        catch { csv = new TextDecoder("shift-jis").decode(buffer); }
        workbook = XLSX.read(csv, { type: "string", raw: true });
      } else workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets["管理表"] ?? workbook.Sheets[workbook.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
      const headerRow = grid.slice(0, 5).findIndex(header => ["商品名", "品名", "物品名"].some(name => header.includes(name)) && ["数量", "個数"].some(name => header.includes(name)));
      if (headerRow < 0) throw new Error("商品名（品名・物品名）と数量（個数）の列が必要です。");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: "", range: headerRow });
      if (!raw.length || raw.length > MAX_ZAICO_ROWS) throw new Error(`1〜${MAX_ZAICO_ROWS}行に分けてください。`);
      const mapped = mapZaicoRows(raw);
      const data = await api({ action: "PREVIEW", rows: mapped });
      setRows(mapped); setPreview(data.preview);
    } catch (e) { setError(e instanceof Error ? e.message : "ファイルを読み取れませんでした。"); }
    finally { setBusy(false); }
  }
  async function save(review: boolean) {
    setBusy(true); setError(""); setNotice("");
    try {
      const selected = pending.filter(row => row.selected).map(({ id, row, mode, itemId }) => ({ id, row, mode, itemId }));
      const total = review ? selected.length : rows.length;
      const data = { created: 0, linked: 0, pending: 0, skipped: 0 };
      for (let offset = 0; offset < total; offset += 25) {
        const result = await api(review ? { action: "REVIEW", reviews: selected.slice(offset, offset + 25) } : { action: "IMPORT", rows: rows.slice(offset, offset + 25) });
        for (const key of ["created", "linked", "pending", "skipped"] as const) data[key] += result[key];
        setNotice("保存中：" + Math.min(offset + 25, total) + " / " + total + "件。途中で止まっても保存済みの内容は残ります。");
      }
      setNotice(`新規登録 ${data.created}件・紐付け ${data.linked}件・確認待ち ${data.pending}件・追加なし ${data.skipped}件`);
      if (!review) { setRows([]); setPreview([]); }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }
  async function registerPendingSystemJan() {
    setBusy(true);setError("");setNotice("");
    let created=0;
    try {
      let more=true;
      while(more){const result=await api({action:"SYSTEM_JAN_PENDING"});created+=result.created;more=result.hasMore===true;setNotice("システムJANを付けて登録中："+created+"件");}
      setNotice("システムJANを付けて"+created+"件登録しました。数量不備・重複候補は確認待ちに残しています。");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"処理できませんでした。保存済みの行は再登録されません。");await load().catch(()=>{});}
    finally{setBusy(false);}
  }
  async function moreHistory() {
    if (!historyCursor) return;
    setBusy(true); setError("");
    try { const data = await api(undefined, historyCursor); setRecent(current => [...current, ...data.recent.filter((row: Recent) => !current.some(existing => existing.id === row.id))]); setHistoryCursor(data.nextHistoryCursor); }
    catch (e) { setError(e instanceof Error ? e.message : "履歴を取得できませんでした。"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-6">
    <div className="rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-bold">CSV・Excelを取り込む</h2>
      <p className="mt-2 text-sm text-slate-600">JANが一致する商品は紐付け、新しい商品は通常の在庫に登録します。JANが空欄・不正な商品にはシステムJANを付けます。数量不備や重複候補は確認待ちに残ります。</p>
      <p className="mt-2 text-sm text-slate-600">既存商品への数量加算・上書きはしません。移行元の数量は履歴に残し、実際の数は棚卸で確定します。zaicoのCSVと従来の管理表にも対応しています。</p>
      <label className="mt-4 block font-bold">CSV・Excelファイル<input aria-label="取り込みファイル" type="file" accept=".csv,.xlsx,.xls" disabled={busy} className={inputClass} onChange={e => { const file = e.target.files?.[0]; if (file) void read(file); e.target.value = ""; }} /></label>
      <p className="mt-2 text-xs text-slate-500">1回1,000行まで。商品名・JAN・数量・単位・保管場所・カテゴリ（大分類）を取り込みます。メーカー・小分類・ロット・期限にも対応。空欄の項目は未設定になります。新規在庫は対象範囲に合う作業中・中断中の棚卸にも追加されます。</p>
    </div>
    {busy && <p role="status">処理しています…</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
    {preview.length > 0 && <div className="rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-bold">取り込み前の確認：{fileName}</h2>
      <div className="my-3 flex flex-wrap gap-3">{["CREATE", "LINK", "PENDING", "SKIPPED"].map(status => <span key={status} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{labels[status]} {preview.filter(row => row.status === status).length}件</span>)}</div>
      <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">行・商品</th><th className="p-2">JAN・数量</th><th className="p-2">処理</th></tr></thead><tbody>{preview.map((entry, index) => <tr key={index} className="border-t"><td className="p-2">{entry.rowNumber}：{entry.row.name || "商品名なし"}</td><td className="p-2">{entry.row.janCode || "JANなし"}<br/>{entry.row.quantity} {entry.row.unit}</td><td className="p-2"><strong>{labels[entry.status]}</strong><p>{entry.reason}</p></td></tr>)}</tbody></table></div>
      <p className="mt-3 text-xs text-slate-600">保存時にもう一度JANを照合します。他の人が登録した商品も重複を確認します。</p>
      <button disabled={busy} onClick={() => void save(false)} className="mt-4 rounded-xl bg-indigo-700 px-5 py-3 font-bold text-white disabled:opacity-50">この内容を取り込む（確認待ちも保存）</button>
    </div>}
    <div className="rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-bold">確認待ち {count}件</h2>
      <p className="mt-2 text-sm text-slate-600">JANや数量を修正して選択行をまとめて処理できます。「対象外にする」は在庫を変更しません。</p>
      {count > 0 && <button type="button" disabled={busy} onClick={()=>void registerPendingSystemJan()} className="mt-3 rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white disabled:opacity-50">JAN不備だけの確認待ちをまとめて登録</button>}
      {count > pending.length && <p className="mt-2 text-sm">先頭{pending.length}件を表示中です。処理すると次の行が表示されます。</p>}
      {pending.some(entry => !validJan(entry.row.janCode) && !rowProblem(entry.row) && !entry.candidates.length) && <button disabled={busy} className="mt-3 rounded-xl border px-4 py-3 font-bold" onClick={() => setPending(values => values.map(entry => ({ ...entry, selected: !validJan(entry.row.janCode) && !rowProblem(entry.row) && !entry.candidates.length, mode: "AUTO" })))}>JANなし・不正で登録できる行を選択</button>}
      {pending.length > 0 && <label className="mt-4 block"><input type="checkbox" disabled={busy} checked={pending.every(row => row.selected)} onChange={e => setPending(values => values.map(row => ({ ...row, selected: e.target.checked })))} /> 表示中の行をすべて選択</label>}
      <fieldset disabled={busy} className="mt-4 space-y-4">{pending.map(entry => <article key={entry.id} className="rounded-xl border p-4">
        <label className="font-bold"><input type="checkbox" checked={entry.selected} onChange={e => update(entry.id, { selected: e.target.checked })}/> {entry.row.name || "商品名なし"}</label>
        <p className="mt-2 text-sm text-amber-800">{entry.reason}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([['name', '商品名'], ['janCode', 'JAN'], ['quantity', '数量'], ['unit', '単位'], ['storageLocation', '保管場所'], ['majorCategory', '大分類']] as const).map(([key, label]) => <label key={key} className="text-sm">{label}<input aria-label={`${entry.id}-${label}`} type="text" inputMode={key === "quantity" || key === "janCode" ? "numeric" : "text"} value={entry.row[key]} onChange={e => update(entry.id, { row: { ...entry.row, [key]: e.target.value } })} className={inputClass}/></label>)}</div>
        <label className="mt-3 block text-sm">処理方法<select className={inputClass} value={entry.mode} onChange={e => update(entry.id, { mode: e.target.value })}><option value="AUTO">再判定（JANなし・不正は自動発行）</option><option value="NEW_NO_JAN">システムJANを付けて登録</option>{entry.candidates.some(item => !item.isArchived) && <option value="LINK">JANが一致する既存商品を選ぶ</option>}<option value="SKIP">対象外にする</option></select></label>
        {entry.mode === "LINK" && <label className="mt-3 block text-sm">紐付ける商品<select className={inputClass} value={entry.itemId} onChange={e => update(entry.id, { itemId: e.target.value })}><option value="">商品を選択</option>{entry.candidates.filter(item => !item.isArchived).map(item => <option key={item.id} value={item.id}>{item.name}（{item.id}）</option>)}</select></label>}
      </article>)}</fieldset>
      {pending.length > 0 && <button disabled={busy || !pending.some(row => row.selected)} onClick={() => void save(true)} className="mt-4 rounded-xl bg-indigo-700 px-5 py-3 font-bold text-white disabled:opacity-50">選択した{pending.filter(row => row.selected).length}件を処理</button>}
      {!count && <p className="mt-3 text-sm text-slate-500">確認待ちはありません。</p>}
    </div>
    {recent.length > 0 && <details className="rounded-2xl border bg-white p-5"><summary className="cursor-pointer font-bold">最近の取り込み履歴（{recent.length}件）</summary><ul className="mt-3 space-y-3">{recent.map(entry => <li key={entry.id} className="border-t pt-3 text-sm"><strong>{entry.row.name}：{labels[entry.status]}</strong><p>取り込み元 {entry.originalRow.quantity} {entry.originalRow.unit} ／ JAN {entry.row.janCode || "なし"}</p><p>{entry.reason}</p>{entry.itemId && <Link className="text-indigo-700 underline" href={`/items/${entry.itemId}`}>商品を確認</Link>}</li>)}</ul>{historyCursor&&<button disabled={busy} onClick={() => void moreHistory()} className="mt-4 rounded-xl border px-4 py-3 font-bold">以前の履歴を表示</button>}</details>}
  </section>;
}
