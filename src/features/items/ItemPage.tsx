"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import CategoryQrScanner from "@/components/CategoryQrScanner";
import ItemTable from "./ItemTable";
import type { Item } from "./types";

type SortType = "nameAsc" | "nameDesc" | "barcodeAsc" | "barcodeDesc";

function getMessage(data: unknown, fallback: string) {
  if (
    typeof data === "object" &&
    data !== null &&
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
      `サーバーから応答を確認できませんでした。（HTTP ${response.status}）`
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `サーバーから正しい応答を確認できませんでした。（HTTP ${response.status}）`
    );
  }
}

export default function ItemPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [majorCategory, setMajorCategory] = useState("");
  const [sort, setSort] = useState<SortType>("nameAsc");
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editName, setEditName] = useState("");
  const [editJanCode, setEditJanCode] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/items", {
        cache: "no-store",
      });

      const data = await readJson(response);

      if (!response.ok || !Array.isArray(data)) {
        throw new Error(
          getMessage(data, "商品一覧を取得できませんでした。")
        );
      }

      setItems(data as Item[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "商品一覧を取得できませんでした。"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const categories = useMemo(() => {
    return Array.from(
      new Set(
        items
          .map((item) => item.majorCategory?.trim() ?? "")
          .filter((category) => category.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, "ja"));
  }, [items]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return items.filter((item) => {
      const normalizedCategory = item.majorCategory?.trim() ?? "";

      const matchesCategory =
        !majorCategory || normalizedCategory === majorCategory;

      const matchesKeyword =
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        (item.janCode ?? "").toLowerCase().includes(keyword) ||
        (item.systemBarcode ?? "").toLowerCase().includes(keyword) ||
        (item.managementCode ?? "").toLowerCase().includes(keyword) ||
        (item.manufacturer ?? "").toLowerCase().includes(keyword);

      return matchesCategory && matchesKeyword;
    });
  }, [items, majorCategory, search]);

  const sortedItems = useMemo(() => {
    const list = [...filteredItems];

    const barcodeOf = (item: Item) =>
      item.janCode || item.systemBarcode || "";

    switch (sort) {
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

  const handleQrDetected = useCallback((category: string) => {
    setMajorCategory(category);
    setSearch("");
    setMessage(`大分類「${category}」で絞り込みました。`);
  }, []);

  const startEdit = (item: Item) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditJanCode(item.janCode ?? "");
    setMessage("");
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setEditName("");
    setEditJanCode("");
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingItem || !editName.trim()) {
      setError("商品名を入力してください。");
      return;
    }

    setSavingEdit(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/items", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingItem.id,
          name: editName.trim(),
          janCode: editJanCode.trim() || null,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(data, "商品情報を更新できませんでした。")
        );
      }

      cancelEdit();
      setMessage("商品情報を更新しました。");
      await fetchItems();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "商品情報を更新できませんでした。"
      );
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-bold tracking-widest text-blue-600">
              INVENTORY OS
            </p>

            <h1 className="mt-1 text-3xl font-black text-slate-900">
              商品一覧・ラベル印刷
            </h1>

            <p className="mt-2 text-slate-600">
              商品を探す、バーコードラベルを印刷する、大分類QRで絞り込むことができます。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/add"
              className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700"
            >
              ＋ 商品登録
            </Link>

            <Link
              href="/admin/category-qr"
              className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700"
            >
              大分類QRを発行
            </Link>

            <button
              type="button"
              onClick={() => void fetchItems()}
              disabled={loading}
              className="rounded-xl bg-white px-4 py-3 font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:text-slate-400"
            >
              更新
            </button>
          </div>
        </header>

        {error && (
          <section className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="text-sm font-bold text-red-600">
              商品一覧エラー
            </p>
            <p className="mt-2 text-slate-700">{error}</p>
          </section>
        )}

        {message && (
          <section className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 font-bold text-blue-800">
            {message}
          </section>
        )}

        {editingItem && (
          <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold text-amber-600">
                  商品情報の編集
                </p>

                <h2 className="mt-1 text-xl font-black text-slate-900">
                  {editingItem.name}
                </h2>
              </div>

              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 hover:bg-slate-200"
              >
                編集をやめる
              </button>
            </div>

            <form
              onSubmit={saveEdit}
              className="mt-5 grid gap-4 sm:grid-cols-2"
            >
              <label>
                <span className="font-bold">
                  商品名 <span className="text-red-600">*</span>
                </span>

                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>

              <label>
                <span className="font-bold">既存JANコード</span>

                <input
                  value={editJanCode}
                  onChange={(event) => setEditJanCode(event.target.value)}
                  inputMode="numeric"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-xl bg-amber-500 px-5 py-3 font-bold text-white hover:bg-amber-600 disabled:bg-slate-400"
                >
                  {savingEdit ? "更新中…" : "商品情報を更新"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="商品名・JAN・システムJAN・管理コードで検索"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />

            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700"
            >
              QRで大分類を読む
            </button>

            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as SortType)
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-700 outline-none"
            >
              <option value="nameAsc">商品名：昇順</option>
              <option value="nameDesc">商品名：降順</option>
              <option value="barcodeAsc">JAN：昇順</option>
              <option value="barcodeDesc">JAN：降順</option>
            </select>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMajorCategory("")}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                !majorCategory
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              すべて（{items.length}）
            </button>

            {categories.map((category) => {
              const count = items.filter(
                (item) => item.majorCategory?.trim() === category
              ).length;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setMajorCategory(category)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    majorCategory === category
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {category}（{count}）
                </button>
              );
            })}
          </div>

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
          {loading ? (
            <div className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow-sm">
              商品一覧を読み込んでいます…
            </div>
          ) : (
            <ItemTable
              items={sortedItems}
              reload={fetchItems}
              onEdit={startEdit}
            />
          )}
        </section>
      </div>

      {scannerOpen && (
        <CategoryQrScanner
          onDetected={handleQrDetected}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </main>
  );
}