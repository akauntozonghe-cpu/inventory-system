"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import BarcodeCamera from "@/components/stocktake/BarcodeCamera";
import { parseStocktakeQr, type StocktakeQr } from "@/lib/stocktakeQr";

type Filter = "ALL" | "UNRECORDED" | "RECORDED" | "DIFFERENCE";
type Action = "PAUSE" | "RESUME" | "COMPLETE";

type Inventory = {
  id: string;
  expectedQuantity: number;
  isRecorded: boolean;
  countedQuantity: number | null;
  managementCode: string | null;
  lotNo: string | null;
  expirationDate: string | null;
  unit: string | null;
  manufacturer: string | null;
  majorCategory: string | null;
  minorCategory: string | null;
  item: {
    id: string;
    name: string;
    janCode: string | null;
    managementCode: string | null;
    manufacturer: string | null;
    majorCategory: string | null;
    minorCategory: string | null;
    defaultUnit: string | null;
  };
  storageLocation: { name: string } | null;
};

type Progress = {
  session: { title: string; scopeLabel: string | null; status: "IN_PROGRESS" | "PAUSED" | "COMPLETED" };
  summary: { targetCount: number; recordedCount: number; matchedCount: number; differenceCount: number; unrecordedCount: number; progressPercent: number };
};

const filters: Array<[Filter, string]> = [
  ["UNRECORDED", "未棚卸"],
  ["RECORDED", "棚卸済"],
  ["DIFFERENCE", "差異あり"],
  ["ALL", "すべて"],
];

export default function StocktakePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const quantityRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [filter, setFilter] = useState<Filter>("UNRECORDED");
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<Inventory[]>([]);
  const [selected, setSelected] = useState<Inventory | null>(null);
  const [quantity, setQuantity] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [scanCandidates, setScanCandidates] = useState<Inventory[]>([]);
  const scanBusyRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadProgress = useCallback(async () => {
    const response = await fetch("/api/stocktake/session/" + id + "/progress");
    if (!response.ok) throw new Error("進捗を取得できませんでした");
    setProgress(await response.json());
  }, [id]);

  const loadItems = useCallback(async (nextKeyword = keyword, nextFilter = filter) => {
    setLoading(true);
    try {
      const url = "/api/inventory/search?sessionId=" + encodeURIComponent(id) +
        "&q=" + encodeURIComponent(nextKeyword) + "&filter=" + nextFilter;
      const response = await fetch(url);
      if (!response.ok) throw new Error("商品を取得できませんでした");
      setItems(await response.json());
    } catch (error) {
      console.error(error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter, id, keyword]);

  useEffect(() => { loadProgress().catch(console.error); }, [loadProgress]);
  useEffect(() => {
    const timer = window.setTimeout(() => { loadItems(); }, 200);
    return () => window.clearTimeout(timer);
  }, [filter, keyword, loadItems]);

  const canEdit = progress?.session.status === "IN_PROGRESS";

  const chooseItem = (item: Inventory) => {
    if (!canEdit) return;
    setSelected(item);
    setQuantity(String(item.countedQuantity ?? item.expectedQuantity));
    requestAnimationFrame(() => {
      quantityRef.current?.focus();
      quantityRef.current?.select();
    });
  };

  const scan = useCallback(async (rawValue: string) => {
    if (scanBusyRef.current) return;
    if (selected) {
      setScanMessage("表示中の商品を保存するか「選択解除」してから次を読み取ってください。");
      return;
    }
    const qr: StocktakeQr = parseStocktakeQr(rawValue);
    if (!qr.value) return;
    scanBusyRef.current = true;
    setKeyword(qr.value);
    setScanMessage("検索中...");
    const url = "/api/inventory/search?sessionId=" + encodeURIComponent(id) +
      "&q=" + encodeURIComponent(qr.value) + "&qrType=" + qr.type + "&filter=ALL";
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("検索に失敗しました");
      const found: Inventory[] = await response.json();
      setScanCandidates(found);
      if (qr.type === "PRODUCT") {
        const exact = found.filter((item) =>
          item.item.janCode === qr.value || item.item.managementCode === qr.value || item.managementCode === qr.value
        );
        const item = exact.length === 1 ? exact[0] : found.length === 1 ? found[0] : null;
        if (item) {
          chooseItem(item);
          setScanMessage("商品を読み取りました。詳細を確認して数量を保存してください。");
        } else if (found.length === 0) {
          setScanMessage("この棚卸の対象商品が見つかりません。");
        } else {
          setScanMessage("同じコードの在庫が複数あります。保管場所を選択してください。");
        }
      } else {
        const labels = { MAJOR_CATEGORY: "大分類", MINOR_CATEGORY: "小分類", LOCATION: "保管場所", PRODUCT: "商品" };
        setItems(found);
        setScanMessage(found.length > 0
          ? `${labels[qr.type]}「${qr.value}」を読み取りました。${found.length}件から商品を選択してください。`
          : `${labels[qr.type]}「${qr.value}」は、この棚卸の対象にありません。`);
      }
    } catch (error) {
      console.error(error);
      setScanMessage("QR・バーコードの検索に失敗しました。もう一度読み取ってください。");
    } finally {
      scanBusyRef.current = false;
    }
  }, [id, selected, canEdit]);

  const save = async () => {
    if (!selected || quantity === "") return;
    const countedQuantity = Number(quantity);
    if (!Number.isInteger(countedQuantity) || countedQuantity < 0) {
      alert("棚卸数量には0以上の整数を入力してください");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/stocktake/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id, inventoryInstanceId: selected.id, countedQuantity }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "保存に失敗しました");
      setSelected(null);
      setQuantity("");
      setKeyword("");
      setFilter("UNRECORDED");
      setScanCandidates([]);
      setScanMessage("保存しました。次の商品を読み取れます。");
      await Promise.all([loadProgress(), loadItems("", "UNRECORDED")]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (action: Action) => {
    const label = action === "PAUSE" ? "棚卸を中断しますか？" :
      action === "RESUME" ? "棚卸を再開しますか？" :
      "未棚卸を含めて終了しますか？";
    if (!window.confirm(label)) return;
    const response = await fetch("/api/stocktake/session/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await response.json();
    if (!response.ok) { alert(data.message ?? "状態を更新できませんでした"); return; }
    if (action === "PAUSE") { router.push("/stocktake/start"); return; }
    await loadProgress();
  };

  const difference = selected && quantity !== "" ? Number(quantity) - selected.expectedQuantity : null;

  return (
    <main className="mx-auto max-w-6xl p-4 text-white sm:p-6 lg:p-8">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{progress?.session.title ?? "棚卸"}</h1>
          <p className="text-sm text-slate-300">対象：{progress?.session.scopeLabel ?? "全在庫"}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/stocktake/start" className="rounded-lg bg-white/15 px-3 py-2 text-sm">一覧へ戻る</Link>
          <Link href={"/stocktake/" + id + "/result"} className="rounded-lg bg-blue-600 px-3 py-2 text-sm">結果</Link>
        </div>
      </header>

      {progress && (
        <section className="mb-4 rounded-xl bg-white p-4 text-slate-800 shadow">
          <div className="flex items-center justify-between gap-3">
            <div className="font-bold">{progress.summary.recordedCount} / {progress.summary.targetCount} 件</div>
            <div className="font-bold text-blue-600">{progress.summary.progressPercent}%</div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600" style={{ width: progress.summary.progressPercent + "%" }} /></div>
          <div className="mt-2 flex justify-between text-xs sm:text-sm">
            <span className="text-green-600">一致 {progress.summary.matchedCount}</span>
            <span className="text-red-600">差異 {progress.summary.differenceCount}</span>
            <span className="text-orange-600">未 {progress.summary.unrecordedCount}</span>
          </div>
        </section>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {progress?.session.status === "IN_PROGRESS" && <button onClick={() => changeStatus("PAUSE")} className="rounded-lg bg-orange-500 px-4 py-2 font-bold">中断</button>}
        {progress?.session.status === "PAUSED" && <button onClick={() => changeStatus("RESUME")} className="rounded-lg bg-green-600 px-4 py-2 font-bold">再開</button>}
        {progress?.session.status !== "COMPLETED" && <button onClick={() => changeStatus("COMPLETE")} className="rounded-lg bg-slate-700 px-4 py-2 font-bold">終了</button>}
      </div>

      {!canEdit && progress && <p className="mb-4 rounded-lg bg-orange-100 p-3 text-sm text-orange-900">この棚卸は{progress.session.status === "PAUSED" ? "中断中" : "終了済み"}です。</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
        <section>
          <div className="flex gap-2">
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} disabled={!canEdit} onKeyDown={(event) => { if (event.key === "Enter") scan(keyword); }} className="min-w-0 flex-1 rounded-xl border bg-white p-4 text-slate-900" placeholder="JAN・商品名・管理番号" />
            <button onClick={() => setCameraOpen(true)} disabled={!canEdit} className="rounded-xl bg-indigo-600 px-4 font-bold">カメラ</button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {filters.map(([value, label]) => <button key={value} onClick={() => setFilter(value)} disabled={!canEdit} className={"whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold " + (filter === value ? "bg-blue-600" : "bg-white text-slate-700")}>{label}</button>)}
          </div>
          <div className="mt-4 space-y-2">
            {loading && <p>読み込み中...</p>}
            {!loading && items.map((item) => {
              const itemDifference = item.countedQuantity === null ? null : item.countedQuantity - item.expectedQuantity;
              return <button key={item.id} onClick={() => chooseItem(item)} disabled={!canEdit} className="w-full rounded-xl bg-white p-4 text-left text-slate-800 shadow">
                <div className="flex justify-between gap-2"><strong>{item.item.name}</strong><span className={"rounded-full px-2 py-1 text-xs font-bold " + (item.isRecorded ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700")}>{item.isRecorded ? "棚卸済" : "未棚卸"}</span></div>
                <div className="mt-1 text-sm text-slate-600">JAN：{item.item.janCode ?? "-"}　棚：{item.storageLocation?.name ?? "-"}</div>
                <div className="mt-2 text-sm">理論在庫：{item.expectedQuantity}{item.isRecorded && <>　棚卸数：{item.countedQuantity}　<span className={itemDifference === 0 ? "text-green-600" : "font-bold text-red-600"}>差異：{itemDifference && itemDifference > 0 ? "+" : ""}{itemDifference}</span></>}</div>
              </button>;
            })}
          </div>
        </section>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-xl bg-white p-5 text-slate-800 shadow">
            <h2 className="text-xl font-bold">棚卸入力</h2>
            {!selected ? <p className="mt-3 text-slate-500">商品を選択またはバーコードを読み取ってください。</p> : <>
              <p className="mt-4 font-bold">{selected.item.name}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm">
                <p><span className="text-slate-500">JAN：</span>{selected.item.janCode ?? "-"}</p>
                <p><span className="text-slate-500">管理番号：</span>{selected.item.managementCode ?? selected.managementCode ?? "-"}</p>
                <p><span className="text-slate-500">メーカー：</span>{selected.item.manufacturer ?? selected.manufacturer ?? "-"}</p>
                <p><span className="text-slate-500">保管場所：</span>{selected.storageLocation?.name ?? "-"}</p>
                <p><span className="text-slate-500">大分類：</span>{selected.item.majorCategory ?? selected.majorCategory ?? "-"}</p>
                <p><span className="text-slate-500">小分類：</span>{selected.item.minorCategory ?? selected.minorCategory ?? "-"}</p>
                <p><span className="text-slate-500">ロット：</span>{selected.lotNo ?? "-"}</p>
                <p><span className="text-slate-500">期限：</span>{selected.expirationDate ?? "-"}</p>
              </div>
              <p className="mt-3 text-sm font-bold text-slate-700">理論在庫：{selected.expectedQuantity} {selected.unit ?? selected.item.defaultUnit ?? ""}</p>
              <div className="mt-3 flex gap-2">
                <Link href={`/items/${selected.item.id}`} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-blue-700">商品詳細を開く</Link>
                <button type="button" onClick={() => { setSelected(null); setQuantity(""); }} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold">選択解除</button>
              </div>
              <label className="mt-5 block text-sm font-bold" htmlFor="quantity">棚卸数量</label>
              <input ref={quantityRef} id="quantity" type="number" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-2 w-full rounded-lg border p-4 text-3xl" />
              {difference !== null && <p className={"mt-3 rounded-lg p-3 font-bold " + (difference === 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>差異：{difference > 0 ? "+" : ""}{difference}</p>}
              <button onClick={save} disabled={saving} className="mt-5 w-full rounded-xl bg-blue-600 py-4 text-lg font-bold text-white">{saving ? "保存中..." : "保存する"}</button>
            </>}
          </section>
        </aside>
      </div>
      {cameraOpen && <BarcodeCamera onDetected={scan} onClose={() => { setCameraOpen(false); setScanCandidates([]); setScanMessage(""); }}>
        {scanMessage && <p className="mb-3 rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-800">{scanMessage}</p>}
        {selected ? <div className="rounded-xl bg-white p-4 shadow">
          <h3 className="text-lg font-bold">{selected.item.name}</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <p>JAN：{selected.item.janCode ?? "-"}</p><p>管理番号：{selected.item.managementCode ?? selected.managementCode ?? "-"}</p>
            <p>大分類：{selected.item.majorCategory ?? selected.majorCategory ?? "-"}</p><p>小分類：{selected.item.minorCategory ?? selected.minorCategory ?? "-"}</p>
            <p>保管場所：{selected.storageLocation?.name ?? "-"}</p><p>理論在庫：{selected.expectedQuantity}</p>
            <p>ロット：{selected.lotNo ?? "-"}</p><p>期限：{selected.expirationDate ?? "-"}</p>
          </div>
          <label className="mt-4 block text-sm font-bold">棚卸数量</label>
          <input ref={quantityRef} type="number" min="0" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-2 w-full rounded-xl border p-3 text-center text-2xl font-bold" />
          <button type="button" onClick={save} disabled={saving} className="mt-3 w-full rounded-xl bg-blue-600 py-3 font-bold text-white">{saving ? "保存中..." : "保存して次を読む"}</button>
        </div> : scanCandidates.length > 0 ? <div className="space-y-2">{scanCandidates.map((item) => <button key={item.id} type="button" onClick={() => chooseItem(item)} className="w-full rounded-xl bg-white p-3 text-left shadow"><strong>{item.item.name}</strong><p className="text-sm text-slate-600">{item.storageLocation?.name ?? "保管場所未設定"}・在庫 {item.expectedQuantity}</p></button>)}</div> : <p className="rounded-xl bg-white p-4 text-center text-sm">商品、大分類、小分類、保管場所のQRを読み取れます。</p>}
      </BarcodeCamera>}
    </main>
  );
}
