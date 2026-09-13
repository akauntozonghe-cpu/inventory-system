"use client";
import { useAppAccess } from "@/components/auth/AppAccessProvider";
import {matchesStockFilter,stockFilterLabels,type StockFilter} from "@/lib/stock-state";
import { useAdminMode } from "@/components/auth/PageAdminMode";
import { fetchFresh } from "@/lib/fetch-fresh";

import CompactFilter from "@/components/common/CompactFilter";
import Link from "@/components/auth/PermissionLink";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
const UnifiedScanner=dynamic(()=>import("@/components/stocktake/UnifiedScanner"),{ssr:false});
import FeedbackToast from "@/components/common/FeedbackToast";
import ItemTable from "./ItemTable";
import type { Item } from "./types";
import { useRegistrationOptions } from "@/hooks/useRegistrationOptions";

import { useLiveRefresh } from "@/hooks/useLiveRefresh";

type SortType =
  | "createdDesc"
  | "createdAsc"
  | "nameAsc"
  | "nameDesc"
  | "barcodeAsc"
  | "barcodeDesc";


function getMessage(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      `サーバーから応答を取得できませんでした。HTTP ${response.status}`
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `サーバーから正しい応答を取得できませんでした。HTTP ${response.status}`
    );
  }
}

export default function ItemPage() {
  const listRequestRef = useRef(0);
  const [items, setItems] = useState<Item[]>([]);
  const {user:currentUser} = useAppAccess();
  const [stockFilter,setStockFilter]=useState<StockFilter>("ALL");
  const [search, setSearch] = useState("");
  const [majorCategory, setMajorCategory] = useState("");
  const [sort, setSort] = useState<SortType>("createdDesc");
  const [todayOnly, setTodayOnly] = useState(false);
  const [registeredDate, setRegisteredDate] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");


  const adminMode = useAdminMode();
  const isAdmin = Boolean(currentUser) && (currentUser?.role === "ADMIN" || adminMode.active);


  const fetchItems = useCallback(async (silent = false) => {
    const requestId = ++listRequestRef.current;
    if (!silent) { setLoading(true); setError(""); }

    try {
      const query = showArchived ? "?includeArchived=true" : "";

      const response = await fetchFresh(`/api/items${query}`);

      const data = await readJson(response);

      if (!response.ok || !Array.isArray(data)) {
        throw new Error(
          getMessage(data, "商品一覧を取得できませんでした。")
        );
      }

      if (requestId === listRequestRef.current) setItems(data as Item[]);
      return data as Item[];
    } catch (loadError) {
      if (requestId !== listRequestRef.current) return;
      if (silent) throw loadError;
      setError(
        loadError instanceof Error
          ? loadError.message
          : "商品一覧を取得できませんでした。"
      );
    } finally {
      if (requestId === listRequestRef.current) setLoading(false);
    }
  }, [showArchived]);

  const syncFailed = useLiveRefresh(() => fetchItems(true));


  useEffect(() => {
    const date = new URLSearchParams(window.location.search).get("registeredDate") ?? "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setRegisteredDate(date);
      setSort("createdAsc");
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (!isAdmin && showArchived) {
      setShowArchived(false);
    }
  }, [isAdmin, showArchived]);

  const registrationOptions = useRegistrationOptions();
  const categories = useMemo(() => {
    return Array.from(
      new Set(
        [...registrationOptions.majorCategories, ...items
          .map((item) => item.majorCategory?.trim() ?? "")
          .filter((category) => category.length > 0)]
      )
    ).sort((a, b) => a.localeCompare(b, "ja"));
  }, [items, registrationOptions.majorCategories]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const selectedStart = registeredDate
      ? new Date(`${registeredDate}T00:00:00`).getTime()
      : 0;
    const selectedEnd = selectedStart + 24 * 60 * 60 * 1000;

    return items.filter((item) => {
      const category = item.majorCategory?.trim() ?? "";

      const matchesCategory =
        !majorCategory || category === majorCategory;

      const searchableText = [
        item.id, item.name,
        item.janCode,
        item.id,
        item.systemBarcode,
        item.managementCode,
        item.managementGroupCode,
        item.manufacturer,
        item.majorCategory,
        item.minorCategory,
        item.defaultUnit,
        ...item.inventoryInstances.flatMap((inventory) => [
          inventory.id, inventory.storageLocation?.name,
          inventory.lotNo,
          inventory.expirationDate,
          inventory.stocktakeStatus,
        ]),
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase();

      return (
        (!todayOnly || new Date(item.createdAt).getTime() >= todayStart) &&
        (!registeredDate ||
          (new Date(item.createdAt).getTime() >= selectedStart &&
            new Date(item.createdAt).getTime() < selectedEnd)) &&
        matchesCategory && matchesStockFilter(item.inventoryInstances,stockFilter) &&
        (!keyword || searchableText.includes(keyword))
      );
    });
  }, [items, majorCategory, registeredDate, search, todayOnly,stockFilter]);

  const sortedItems = useMemo(() => {
    const list = [...filteredItems];

    const barcodeOf = (item: Item) =>
      item.janCode || item.systemBarcode || "";

    switch (sort) {
      case "createdDesc":
        return list.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      case "createdAsc":
        return list.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

      case "nameDesc":
        return list.sort((a, b) => b.name.localeCompare(a.name, "ja"));

      case "barcodeAsc":
        return list.sort((a, b) =>
          barcodeOf(a).localeCompare(barcodeOf(b), "ja")
        );

      case "barcodeDesc":
        return list.sort((a, b) =>
          barcodeOf(b).localeCompare(barcodeOf(a), "ja")
        );

      default:
        return list.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    }
  }, [filteredItems, sort]);

  const activeItemCount = items.filter((item) => !item.isArchived).length;
  const archivedItemCount = items.filter((item) => item.isArchived).length;

  const handleQrDetected = useCallback((category: string) => {
    setStockFilter("ALL");setMajorCategory(category);
    setSearch("");
    setTodayOnly(false); setRegisteredDate("");
    setMessage(`大分類「${category}」で絞り込みました。`);
  }, []);


  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <FeedbackToast
        message={error}
        tone="error"
        title="操作エラー"
        onClose={() => setError("")}
      />
      <FeedbackToast
        message={message}
        tone="success"
        onClose={() => setMessage("")}
        autoCloseMs={5000}
      />
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-bold tracking-widest text-blue-600">
              INVENTORY OS
            </p>

            <h1 className="mt-1 text-3xl font-black text-slate-900">
              商品・在庫・ラベル管理
            </h1>

            <p className="mt-2 text-slate-600">
              通常在庫・フリマ準備・出品・発送の状態を、商品やロットと紐づけて確認できます。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <>
                <Link
                  href="/add"
                  className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-700"
                >
                  商品を登録
                </Link>

                <Link
                  href="/admin/category-qr"
                  className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white transition hover:bg-indigo-700"
                >
                  大分類QRを発行
                </Link>
              </>
            )}

            <button
              type="button"
              onClick={() => void fetchItems()}
              disabled={loading}
              className="rounded-xl bg-white px-4 py-3 font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              更新
            </button>
          </div>
        </header>

        <p role="status" className="mb-3 text-sm font-bold text-slate-700">{syncFailed ? "同期できていません。表示は前回取得時点です。通信回復後に再取得します。" : "他端末の登録・在庫変更を自動取得（通信時間＋約1秒）。"}</p>
        {isAdmin && (
          <details className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-3"><summary className="cursor-pointer font-bold">廃止商品の表示</summary>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="mt-1 text-sm text-indigo-800">
                  商品の編集・廃止・復元・複数選択による一括操作ができます。
                </p>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-4 py-3 font-bold text-slate-700 shadow-sm">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => {
                    setShowArchived(event.target.checked);
                    setMajorCategory("");
                    setMessage("");
                  }}
                  className="h-5 w-5"
                />
                廃止済みも表示
              </label>
            </div>

            <p className="mt-3 text-sm text-indigo-800">
              通常商品：{activeItemCount}件
              {showArchived && ` ／ 廃止済み：${archivedItemCount}件`}
            </p>
          </details>
        )}


        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <input
              aria-label="商品を検索"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value.normalize("NFKC"))}
              placeholder="商品名・JAN・システムJAN・メーカー・分類で検索"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />

            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white transition hover:bg-indigo-700"
            >
              JAN・大分類QRを読み取る
            </button>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortType)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-700 outline-none"
            >
              <option value="createdDesc">登録順：新しい順</option>
              <option value="createdAsc">登録順：古い順</option>
              <option value="nameAsc">商品名：昇順</option>
              <option value="nameDesc">商品名：降順</option>
              <option value="barcodeAsc">識別コード：昇順</option>
              <option value="barcodeDesc">識別コード：降順</option>
            </select>
          </div>

          <label className="mt-3 block text-sm font-bold">在庫・フリマの状態<select aria-label="在庫・フリマの状態" value={stockFilter} onChange={event=>setStockFilter(event.target.value as StockFilter)} className="ml-2 max-w-full rounded-xl border p-3">{Object.entries(stockFilterLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-950">
            <input
              type="checkbox"
              checked={todayOnly}
              onChange={(event) => setTodayOnly(event.target.checked)}
              className="h-5 w-5 accent-blue-600"
            />
            本日登録した商品のみ表示（一括印刷対象）
          </label>

          {registeredDate && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-950">
              <span>{registeredDate} の登録商品だけを表示中</span>
              <button type="button" onClick={() => setRegisteredDate("")} className="rounded-lg bg-white px-3 py-1.5 text-emerald-800 shadow-sm">
                日付指定を解除
              </button>
            </div>
          )}

          <CompactFilter label="大分類" value={majorCategory} onChange={setMajorCategory} options={[{ value: "", label: "すべて" }, ...categories.map(category => ({ value: category, label: category }))]} />

          {majorCategory && (
            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-indigo-50 px-4 py-3">
              <p className="font-bold text-indigo-800">
                大分類「{majorCategory}」で絞り込み中（{filteredItems.length}件）
              </p>

              <button
                type="button"
                onClick={() => setMajorCategory("")}
                className="shrink-0 text-sm font-bold text-indigo-700 underline"
              >
                絞り込みを解除
              </button>
            </div>
          )}
        </section>

        <section className="mt-6">
          {loading && items.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow-sm">
              商品一覧を読み込んでいます…
            </div>
          ) : (
            <ItemTable
              items={sortedItems}
              isAdmin={isAdmin}
              filterKey={JSON.stringify([search, majorCategory, sort, todayOnly, registeredDate, showArchived,stockFilter])}
              reload={async()=>{await fetchItems(true);}}
            />
          )}
        </section>
      </div>

      {scannerOpen && <UnifiedScanner
        onClose={() => setScannerOpen(false)}
        onCategory={async name => { handleQrDetected(name); await fetchItems(true); }}
        onProduct={async code => { const latest=await fetchItems(true);if(!latest?.some(item=>[item.id,item.janCode,item.systemBarcode].includes(code)))throw new Error("SCAN_JAN_NOT_MANAGED：このJAN・商品コードは管理対象の商品に登録されていません。登録済みの商品か確認してください。");setStockFilter("ALL");setSearch(code.normalize("NFKC")); setMajorCategory(""); setTodayOnly(false); setRegisteredDate(""); }}
      />}
    </main>
  );
}
