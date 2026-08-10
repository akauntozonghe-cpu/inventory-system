"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SystemBarcodeLabel from "@/components/SystemBarcodeLabel";

type InventoryInstance = {
  id: string;
  quantity: number;
  actualQuantity: number | null;
  lotNo: string | null;
  expirationDate: string | null;
  unit: string | null;
  stocktakeStatus: string;
  updatedAt: string;
  storageLocation: {
    name: string;
  } | null;
};

type Item = {
  id: string;
  managementCode: string | null;
  managementGroupCode: string | null;
  janCode: string | null;
  systemBarcode: string | null;
  name: string;
  manufacturer: string | null;
  majorCategory: string | null;
  minorCategory: string | null;
  defaultUnit: string | null;
  inventoryInstances: InventoryInstance[];
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
  }).format(date);
}

function readMessage(data: unknown, fallback: string) {
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

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();

  const id = typeof params.id === "string" ? params.id : "";

  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      setError("商品IDを確認できませんでした。");
      setLoading(false);
      return;
    }

    const loadItem = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`/api/items/${id}`, {
          cache: "no-store",
        });

        const text = await response.text();

        let data: unknown = null;

        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          throw new Error("商品情報の形式を確認できませんでした。");
        }

        if (!response.ok || typeof data !== "object" || data === null) {
          throw new Error(
            readMessage(data, "商品情報を取得できませんでした。")
          );
        }

        setItem(data as Item);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "商品情報を取得できませんでした。"
        );
      } finally {
        setLoading(false);
      }
    };

    void loadItem();
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-10 text-center text-slate-500 shadow-sm">
          商品情報を読み込んでいます…
        </div>
      </main>
    );
  }

  if (error || !item) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-5xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          {error || "商品が見つかりません。"}

          <div className="mt-5">
            <Link
              href="/items"
              className="inline-flex rounded-xl bg-slate-800 px-4 py-3 font-bold text-white"
            >
              商品一覧へ戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-widest text-blue-600">
              ITEM DETAIL
            </p>

            <h1 className="mt-1 text-3xl font-black text-slate-900">
              {item.name}
            </h1>

            <p className="mt-2 text-slate-600">
              商品と保管在庫の詳細
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/items")}
            className="rounded-xl bg-white px-4 py-3 font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            商品一覧へ戻る
          </button>
        </header>

        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-black text-slate-900">
              商品情報
            </h2>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-sm font-bold text-slate-500">
                  既存JANコード
                </p>
                <p className="mt-1 break-all text-lg font-bold text-slate-900">
                  {item.janCode ?? "未登録"}
                </p>
              </div>

              <div>
                <p className="text-sm font-bold text-slate-500">
                  システムJAN
                </p>
                <p className="mt-1 break-all text-lg font-bold text-slate-900">
                  {item.systemBarcode ?? "-"}
                </p>
              </div>

              <div>
                <p className="text-sm font-bold text-slate-500">
                  商品管理コード
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {item.managementCode ?? "-"}
                </p>
              </div>

              <div>
                <p className="text-sm font-bold text-slate-500">
                  管理グループコード
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {item.managementGroupCode ?? "-"}
                </p>
              </div>

              <div>
                <p className="text-sm font-bold text-slate-500">
                  メーカー
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {item.manufacturer ?? "-"}
                </p>
              </div>

              <div>
                <p className="text-sm font-bold text-slate-500">
                  分類
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {[item.majorCategory, item.minorCategory]
                    .filter(Boolean)
                    .join(" / ") || "-"}
                </p>
              </div>

              <div>
                <p className="text-sm font-bold text-slate-500">
                  基本単位
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {item.defaultUnit ?? "-"}
                </p>
              </div>
            </div>
          </section>

          <SystemBarcodeLabel
            itemId={item.id}
            itemName={item.name}
            janCode={item.janCode}
            initialSystemJan={item.systemBarcode}
          />

          <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  保管在庫
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {item.inventoryInstances.length} 件の在庫があります。
                </p>
              </div>
            </div>

            {item.inventoryInstances.length === 0 ? (
              <div className="mt-5 rounded-xl bg-slate-100 p-6 text-center text-slate-600">
                保管在庫はまだ登録されていません。
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {item.inventoryInstances.map((inventory) => (
                  <article
                    key={inventory.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-bold text-slate-900">
                          {inventory.storageLocation?.name ??
                            "保管場所未設定"}
                        </p>

                        <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                          <div>
                            <dt className="font-bold text-slate-500">
                              ロット番号
                            </dt>
                            <dd>{inventory.lotNo ?? "-"}</dd>
                          </div>

                          <div>
                            <dt className="font-bold text-slate-500">
                              使用期限
                            </dt>
                            <dd>
                              {formatDate(inventory.expirationDate)}
                            </dd>
                          </div>

                          <div>
                            <dt className="font-bold text-slate-500">
                              最終更新
                            </dt>
                            <dd>{formatDate(inventory.updatedAt)}</dd>
                          </div>
                        </dl>
                      </div>

                      <div className="flex items-end justify-between gap-4 sm:block sm:text-right">
                        <div>
                          <p className="text-sm font-bold text-slate-500">
                            現在庫
                          </p>
                          <p className="text-3xl font-black text-blue-600">
                            {inventory.quantity}
                            <span className="ml-1 text-base">
                              {inventory.unit ??
                                item.defaultUnit ??
                                "個"}
                            </span>
                          </p>
                        </div>

                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${
                            inventory.stocktakeStatus === "棚卸済"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {inventory.stocktakeStatus}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}