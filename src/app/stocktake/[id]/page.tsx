"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BarcodeCamera from "@/components/stocktake/BarcodeCamera";

type Filter = "ALL" | "UNRECORDED" | "RECORDED" | "DIFFERENCE";
type Action = "PAUSE" | "RESUME" | "COMPLETE";
type Inventory = {
  id: string;
  expectedQuantity: number;
  isRecorded: boolean;
  countedQuantity: number | null;
  item: { name: string; janCode: string | null; managementCode: string | null };
  storageLocation: { name: string } | null;
};
type Progress = {
  session: { id: string; title: string; scopeLabel: string | null; status: "IN_PROGRESS" | "PAUSED" | "COMPLETED" };
  summary: { targetCount: number; recordedCount: number; matchedCount: number; differenceCount: number; unrecordedCount: number; progressPercent: number };
};

const filters: Array<[Filter, string]> = [
  ["UNRECORDED", "未棚卸"],
  ["RECORDED", "棚卸済み"],
  ["DIFFERENCE", "差異あり"],
  ["ALL", "すべて"],
];

export default function StocktakePage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const emergencyPauseRef = useRef(false);
  const historyGuardRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const [progress, setProgress] = useState<Progress | null>(null);
  const [items, setItems] = useState<Inventory[]>([]);
  const [scannerCandidates, setScannerCandidates] = useState<Inventory[]>([]);
  const [selected, setSelected] = useState<Inventory | null>(null);
  const [filter, setFilter] = useState<Filter>("UNRECORDED");
  const [keyword, setKeyword] = useState("");
  const [quantity, setQuantity] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [singleCameraOpen, setSingleCameraOpen] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [systemError, setSystemError] = useState<string | null>(null);
  const [errorRequiresAcknowledgement, setErrorRequiresAcknowledgement] = useState(false);
  const canEdit = progress?.session.status === "IN_PROGRESS";

  const fetchProgress = useCallback(async () => {
    const res = await fetch(`/api/stocktake/session/${sessionId}/progress`);
    if (!res.ok) throw new Error("進捗を取得できませんでした");
    setProgress(await res.json());
  }, [sessionId]);

  const fetchItems = useCallback(async (nextKeyword = keyword, nextFilter = filter) => {
    setLoadingItems(true);
    try {
      const res = await fetch(`/api/inventory/search?sessionId=${encodeURIComponent(sessionId)}&q=${encodeURIComponent(nextKeyword)}&filter=${nextFilter}`);
      if (!res.ok) throw new Error("在庫を取得できませんでした");
      setItems(await res.json());
    } catch (error) {
      console.error(error);
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [filter, keyword, sessionId]);

  useEffect(() => {
    fetchProgress().catch(() => setMessage("進捗を取得できませんでした"));
  }, [fetchProgress]);

  useEffect(() => {
    const timer = window.setTimeout(fetchItems, 250);
    return () => window.clearTimeout(timer);
  }, [fetchItems]);

  const selectItem = (item: Inventory) => {
    if (!canEdit) {
      setMessage("中断中または終了済みの棚卸は編集できません");
      return;
    }
    setSelected(item);
    setQuantity(String(item.countedQuantity ?? item.expectedQuantity));
    setMessage("");
    requestAnimationFrame(() => {
      quantityRef.current?.focus();
      quantityRef.current?.select();
    });
  };

  // 通常カメラは、読取後に閉じて通常画面のカードを表示するだけ。
  // 数量入力まで進めるのは連続スキャンだけにする。
  const scanBarcode = useCallback(async (barcode: string, autoSelect = false) => {
    if (selected) {
      setMessage("いまの商品を保存してから、次を読み取ってください");
      return;
    }
    const value = barcode.trim();
    if (!value) return;
    setKeyword(value);
    try {
      const res = await fetch(`/api/inventory/search?sessionId=${encodeURIComponent(sessionId)}&q=${encodeURIComponent(value)}&filter=ALL`);
      if (!res.ok) throw new Error("バーコード検索に失敗しました");
      const data: Inventory[] = await res.json();
      setItems(data);
      if (autoSelect) setScannerCandidates(data);
      else setScannerCandidates([]);

      const exactMatches = data.filter((item) => item.item.janCode === value || item.item.managementCode === value);
      const scannedItem = exactMatches.length === 1 ? exactMatches[0] : data.length === 1 ? data[0] : null;
      if (scannedItem && autoSelect) {
        setSelected(scannedItem);
        setQuantity(String(scannedItem.countedQuantity ?? scannedItem.expectedQuantity));
        setMessage(`読み取りました：${value}`);
        requestAnimationFrame(() => {
          quantityRef.current?.focus();
          quantityRef.current?.select();
        });
      } else if (scannedItem) {
        setMessage(`読み取りました：${value}`);
      } else if (data.length === 0) {
        setMessage("対象在庫が見つかりません");
      } else {
        setMessage(`${data.length}件見つかりました。保管場所を選んでください。`);
      }
    } catch (error) {
      console.error(error);
      setMessage("バーコード検索に失敗しました");
    }
  }, [selected, sessionId]);

  const save = async () => {
    if (!selected) return;
    const countedQuantity = Number(quantity);
    if (!Number.isInteger(countedQuantity) || countedQuantity < 0) {
      setMessage("棚卸数量は0以上の整数で入力してください");
      quantityRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/stocktake/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, inventoryInstanceId: selected.id, countedQuantity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "保存に失敗しました");
      const difference = countedQuantity - selected.expectedQuantity;
      setSelected(null);
      setQuantity("");
      setKeyword("");
      setScannerCandidates([]);
      setMessage(difference === 0 ? "保存しました。一致です。次を読み取ってください。" : `保存しました。差異 ${difference > 0 ? "+" : ""}${difference}`);
      await Promise.all([fetchProgress(), fetchItems("", filter)]);
      requestAnimationFrame(() => {
        if (!scannerOpen) searchRef.current?.focus();
      });
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const changeQuantity = (amount: number) => {
    const current = Number(quantity || 0);
    setQuantity(String(Math.max(0, current + amount)));
    quantityRef.current?.focus();
  };

  const changeStatus = async (action: Action) => {
    const confirmation = action === "PAUSE"
      ? "棚卸を中断してもよろしいですか？入力済みの内容は残ります。"
      : action === "COMPLETE"
        ? "未棚卸の商品が残っていても終了しますか？"
        : "";
    if (confirmation && !window.confirm(confirmation)) return;
    try {
      const res = await fetch(`/api/stocktake/session/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "状態を変更できませんでした");
      if (action === "PAUSE") {
        setMessage("中断しました。開始画面へ戻ります...");
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        router.push("/stocktake/start");
        return;
      }
      await fetchProgress();
      setMessage("棚卸を再開しました。");
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "状態の変更に失敗しました");
    }
  };

  const showResultBeforeCompletion = () => {
    if (!window.confirm("終了してもよろしいですか？結果を確認したあと、確定すると棚卸が完了します。")) return;
    router.push(`/stocktake/${sessionId}/result`);
  };

  // 予期しない離脱・エラー時は、保存済みの棚卸記録を守るため中断状態にする。
  const protectAndPause = useCallback(async (reason: string, returnToStart: boolean, requireAcknowledgement = false) => {
    if (!canEdit || emergencyPauseRef.current) return;
    emergencyPauseRef.current = true;
    const protectionMessage = `${reason} 保存済みデータを保護するため、棚卸を中断しました。`;
    setMessage(protectionMessage);
    setSystemError(protectionMessage);
    setErrorRequiresAcknowledgement(requireAcknowledgement);
    try {
      await fetch(`/api/stocktake/session/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PAUSE" }),
        keepalive: true,
      });
    } catch (error) {
      console.error("棚卸の保護中断に失敗しました", error);
    }
    if (returnToStart) {
      window.setTimeout(() => router.replace("/stocktake/start"), 2500);
    }
  }, [canEdit, router, sessionId]);

  useEffect(() => {
    if (!historyGuardRef.current) {
      window.history.pushState({ stocktakeWork: sessionId }, "", window.location.href);
      historyGuardRef.current = true;
    }
    const onPopState = () => {
      window.history.pushState({ stocktakeWork: sessionId }, "", window.location.href);
      void protectAndPause("ブラウザの戻る操作を検知しました。", true);
    };
    const onError = () => { void protectAndPause("画面エラーを検知しました。", false, true); };
    const onUnhandledRejection = () => { void protectAndPause("予期しないエラーを検知しました。", false, true); };
    const onPageHide = () => { void protectAndPause("ページ離脱を検知しました。", false); };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [protectAndPause]);

  // 30分間操作がなければ、自動中断して開始画面へ戻る。
  useEffect(() => {
    if (!canEdit) return;
    const markActivity = () => { lastActivityRef.current = Date.now(); };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "input"];
    events.forEach((event) => window.addEventListener(event, markActivity, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= 30 * 60 * 1000) {
        void protectAndPause("30分間操作がありませんでした。", true);
      }
    }, 15000);
    return () => {
      events.forEach((event) => window.removeEventListener(event, markActivity));
      window.clearInterval(timer);
    };
  }, [canEdit, protectAndPause]);

  // 他の端末で保存された棚卸も、作業を邪魔しないタイミングで画面へ反映する。
  useEffect(() => {
    if (!canEdit || selected || scannerOpen || singleCameraOpen) return;
    const timer = window.setInterval(() => {
      fetchProgress().catch(console.error);
      fetchItems().catch(console.error);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [canEdit, fetchItems, fetchProgress, scannerOpen, selected, singleCameraOpen]);

  const difference = selected ? Number(quantity || 0) - selected.expectedQuantity : 0;
  const quantityPanel = selected && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-blue-600">棚卸入力</p>
        <h2 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl">{selected.item.name}</h2>
        <p className="mt-2 text-sm text-slate-600">保管場所：{selected.storageLocation?.name ?? "未設定"}</p>
      </div>
      <button type="button" onClick={() => { setSelected(null); setQuantity(""); }} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">戻る</button>
    </div>
    <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-slate-200 py-4 text-sm">
      <div><dt className="text-slate-500">JANコード</dt><dd className="mt-1 font-bold text-slate-900">{selected.item.janCode ?? "-"}</dd></div>
      <div><dt className="text-slate-500">管理コード</dt><dd className="mt-1 font-bold text-slate-900">{selected.item.managementCode ?? "-"}</dd></div>
    </dl>
    <div className="mt-5 rounded-2xl border-2 border-slate-900 px-4 py-3"><span className="text-sm text-slate-500">現在庫</span><span className="float-right text-xl font-bold">{selected.expectedQuantity}</span></div>
    <label className="mt-5 block text-sm font-bold text-slate-700">棚卸数量</label>
    <div className="mt-2 grid grid-cols-[64px_minmax(0,1fr)_64px] items-center gap-3">
      <button type="button" onClick={() => changeQuantity(-1)} disabled={!canEdit || saving} className="h-14 rounded-2xl bg-slate-100 text-3xl font-medium text-slate-800 disabled:opacity-50">−</button>
      <input ref={quantityRef} type="number" min="0" inputMode="numeric" value={quantity} disabled={!canEdit || saving} onChange={(event) => setQuantity(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") save(); }} className="h-14 w-full rounded-2xl border-2 border-slate-900 bg-white text-center text-3xl font-bold text-slate-950 outline-none focus:border-blue-600 disabled:bg-slate-100" />
      <button type="button" onClick={() => changeQuantity(1)} disabled={!canEdit || saving} className="h-14 rounded-2xl bg-blue-600 text-3xl font-medium text-white disabled:opacity-50">＋</button>
    </div>
    <p className={`mt-5 rounded-2xl px-4 py-4 text-center text-lg font-bold ${difference === 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>差異：{difference > 0 ? "+" : ""}{difference}</p>
    <button type="button" onClick={save} disabled={!canEdit || saving} className="mt-5 w-full rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white shadow-sm hover:bg-blue-700 disabled:bg-slate-400">{saving ? "保存中..." : "棚卸を保存"}</button>
  </section>;

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-2xl font-bold sm:text-3xl">{progress?.session.title ?? "棚卸"}</h1><p className="mt-1 text-sm text-slate-600">対象：{progress?.session.scopeLabel ?? "全在庫"}</p></div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => { setScannerCandidates([]); setScannerOpen(true); }} disabled={!canEdit} className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:bg-slate-400">連続スキャン</button>
          {progress?.session.status === "IN_PROGRESS" && <button type="button" onClick={() => changeStatus("PAUSE")} className="shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-white">中断</button>}
          {progress?.session.status === "PAUSED" && <button type="button" onClick={() => changeStatus("RESUME")} className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white">再開</button>}
          {progress?.session.status === "IN_PROGRESS" && <button type="button" onClick={showResultBeforeCompletion} className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white">終了</button>}
        </div>
      </header>

      {progress && <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-end justify-between"><div><p className="text-sm text-slate-500">棚卸進捗</p><p className="mt-1 text-3xl font-bold">{progress.summary.recordedCount}<span className="text-lg font-normal text-slate-500"> / {progress.summary.targetCount}</span></p></div><p className="text-3xl font-bold text-blue-600">{progress.summary.progressPercent}%</p></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress.summary.progressPercent}%` }} /></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl bg-slate-100 p-2"><p className="text-xs text-slate-500">一致</p><p className="text-xl font-bold text-emerald-600">{progress.summary.matchedCount}</p></div><div className="rounded-2xl bg-slate-100 p-2"><p className="text-xs text-slate-500">差異</p><p className="text-xl font-bold text-red-600">{progress.summary.differenceCount}</p></div><div className="rounded-2xl bg-slate-100 p-2"><p className="text-xs text-slate-500">未棚卸</p><p className="text-xl font-bold text-orange-600">{progress.summary.unrecordedCount}</p></div></div></section>}

      {message && <p className="mb-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_430px]">
        <section>
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex gap-2"><input ref={searchRef} disabled={!canEdit} value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); scanBarcode(keyword); } }} placeholder="JAN・バーコード・商品名で検索" className="min-w-0 flex-1 rounded-2xl border-2 border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600 disabled:bg-slate-100" /><button type="button" onClick={() => setSingleCameraOpen(true)} disabled={!canEdit} className="shrink-0 rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white shadow-sm disabled:bg-slate-400">📷<span className="ml-2 hidden sm:inline">カメラで読む</span></button></div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{filters.map(([value, label]) => <button key={value} type="button" disabled={!canEdit} onClick={() => { setFilter(value); setSelected(null); }} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold disabled:opacity-50 ${filter === value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>{label}</button>)}</div>
          </div>
          <div className="mt-4 lg:hidden">{quantityPanel}</div>
          <div className="mt-4 space-y-3">{loadingItems ? <div className="rounded-3xl bg-white p-6 text-slate-500 shadow-sm">読み込み中...</div> : items.map((item) => { const itemDifference = item.countedQuantity === null ? null : item.countedQuantity - item.expectedQuantity; const state = !item.isRecorded ? "未棚卸" : itemDifference === 0 ? "一致" : `差異 ${itemDifference && itemDifference > 0 ? "+" : ""}${itemDifference}`; return <button key={item.id} type="button" disabled={!canEdit} onClick={() => selectItem(item)} className="w-full rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-400 hover:shadow disabled:cursor-not-allowed disabled:opacity-60"><div className="flex justify-between gap-3"><div className="min-w-0"><h2 className="text-lg font-bold text-slate-950">{item.item.name}</h2><p className="mt-2 text-sm text-slate-600">JAN：{item.item.janCode ?? "-"}</p><p className="text-sm text-slate-600">保管場所：{item.storageLocation?.name ?? "未設定"}</p><p className="mt-3 text-lg font-bold text-slate-950">現在庫：{item.expectedQuantity}</p></div><span className={`h-fit shrink-0 rounded-full px-3 py-1 text-sm font-bold ${!item.isRecorded ? "bg-orange-100 text-orange-700" : itemDifference === 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{state}</span></div></button>; })}</div>
        </section>
        <aside className="hidden lg:block">{quantityPanel || <div className="sticky top-6 rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm"><p className="text-lg font-bold">商品を選んでください</p><p className="mt-2 text-sm text-slate-500">カードを選ぶか、カメラでバーコードを読み取ると数量を入力できます。</p></div>}</aside>
      </div>
    </div>
    {singleCameraOpen && <BarcodeCamera onDetected={(barcode) => scanBarcode(barcode, false)} onClose={() => setSingleCameraOpen(false)} closeOnDetect />}
    {scannerOpen && <BarcodeCamera onDetected={(barcode) => scanBarcode(barcode, true)} onClose={() => { setScannerOpen(false); setSelected(null); setQuantity(""); setScannerCandidates([]); }}><div className="max-h-[55vh] overflow-y-auto">{selected ? quantityPanel : scannerCandidates.length > 0 ? <div className="space-y-2"><p className="px-1 text-sm font-bold text-slate-700">複数の在庫が見つかりました。保管場所を選んでください。</p>{scannerCandidates.map((item) => <button key={item.id} type="button" onClick={() => selectItem(item)} className="w-full rounded-xl bg-white p-4 text-left shadow"><p className="font-bold">{item.item.name}</p><p className="mt-1 text-sm text-slate-600">保管場所：{item.storageLocation?.name ?? "未設定"}</p><p className="text-sm font-bold text-blue-600">現在庫：{item.expectedQuantity}</p></button>)}</div> : <div className="rounded-2xl bg-white p-5 text-center shadow"><p className="font-bold">商品を読み取ってください</p><p className="mt-2 text-sm text-slate-600">読み取った商品と数量入力が、ここに表示されます。</p></div>}</div></BarcodeCamera>}
    {systemError && <div role="alertdialog" aria-live="assertive" className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/75 p-5"><section className="w-full max-w-md rounded-3xl bg-white p-6 text-slate-900 shadow-2xl"><p className="text-sm font-bold text-red-600">システム保護エラー</p><h2 className="mt-2 text-2xl font-bold">作業を安全停止しました</h2><p className="mt-4 leading-7 text-slate-700">{systemError}</p>{errorRequiresAcknowledgement ? <><p className="mt-4 text-sm text-slate-500">このエラーを確認するまで、棚卸の操作はできません。</p><button type="button" onClick={() => router.replace("/stocktake/start")} className="mt-6 w-full rounded-2xl bg-slate-800 py-4 text-lg font-bold text-white">開始画面へ戻る</button></> : <p className="mt-4 text-sm text-slate-500">保存済みの棚卸データは保護されています。開始画面へ戻ります。</p>}</section></div>}
    {progress?.session.status === "PAUSED" && !systemError && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/70 p-5"><section className="w-full max-w-md rounded-3xl bg-white p-6 text-center text-slate-900 shadow-2xl"><p className="text-sm font-bold text-orange-600">棚卸は中断中です</p><h2 className="mt-2 text-2xl font-bold">すべての操作を停止しています</h2><p className="mt-4 text-slate-600">カメラ・検索・数量入力・保存は、再開するまで使えません。</p><button type="button" onClick={() => changeStatus("RESUME")} className="mt-6 w-full rounded-2xl bg-emerald-600 py-4 text-lg font-bold text-white">再開する</button></section></div>}
  </main>;
}
