"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import BarcodeCamera from "@/components/stocktake/BarcodeCamera";

type Filter = "ALL" | "UNRECORDED" | "RECORDED" | "DIFFERENCE";
type Action = "PAUSE" | "RESUME" | "COMPLETE";

type Inventory = {
  id: string;
  expectedQuantity: number;
  isRecorded: boolean;
  countedQuantity: number | null;
  item: {
    name: string;
    janCode: string | null;
    managementCode: string | null;
  };
  storageLocation: { name: string } | null;
};

type Progress = {
  session: {
    id: string;
    title: string;
    scopeLabel: string | null;
    status: "IN_PROGRESS" | "PAUSED" | "COMPLETED";
  };
  summary: {
    targetCount: number;
    recordedCount: number;
    matchedCount: number;
    differenceCount: number;
    unrecordedCount: number;
    progressPercent: number;
  };
};

const filters: Array<[Filter, string]> = [
  ["UNRECORDED", "未棚卸のみ"],
  ["RECORDED", "棚卸済み"],
  ["DIFFERENCE", "差異あり"],
  ["ALL", "すべて"],
];

export default function StocktakePage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const router = useRouter();

  const searchRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [items, setItems] = useState<Inventory[]>([]);
  const [selected, setSelected] = useState<Inventory | null>(null);

  const [filter, setFilter] = useState<Filter>("UNRECORDED");
  const [keyword, setKeyword] = useState("");
  const [quantity, setQuantity] = useState("");

  const [scannerOpen, setScannerOpen] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const canEdit = progress?.session.status === "IN_PROGRESS";

  const fetchProgress = useCallback(async () => {
    const response = await fetch(
      `/api/stocktake/session/${sessionId}/progress`
    );

    if (!response.ok) {
      throw new Error("進捗を取得できませんでした");
    }

    setProgress(await response.json());
  }, [sessionId]);

  const fetchItems = useCallback(
    async (
      nextKeyword = keyword,
      nextFilter = filter
    ) => {
      setLoadingItems(true);

      try {
        const response = await fetch(
          `/api/inventory/search?sessionId=${encodeURIComponent(
            sessionId
          )}&q=${encodeURIComponent(
            nextKeyword
          )}&filter=${nextFilter}`
        );

        if (!response.ok) {
          throw new Error("在庫を取得できませんでした");
        }

        setItems(await response.json());
      } catch (error) {
        console.error(error);
        setItems([]);
      } finally {
        setLoadingItems(false);
      }
    },
    [filter, keyword, sessionId]
  );

  useEffect(() => {
    fetchProgress().catch((error) => {
      console.error(error);
      setMessage("進捗を取得できませんでした");
    });
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
    setQuantity(
      String(item.countedQuantity ?? item.expectedQuantity)
    );
    setMessage("");

    requestAnimationFrame(() => {
      quantityRef.current?.focus();
      quantityRef.current?.select();
    });
  };

  const scanBarcode = useCallback(
    async (barcode: string) => {
      // 入力中は次のバーコードを受け付けない。
      // カメラ自体は起動したままなので、保存後すぐ次を読める。
      if (selected) {
        setMessage(
          "いまの商品を保存してから、次を読み取ってください"
        );
        return;
      }

      const value = barcode.trim();
      if (!value) return;

      setKeyword(value);

      try {
        const response = await fetch(
          `/api/inventory/search?sessionId=${encodeURIComponent(
            sessionId
          )}&q=${encodeURIComponent(value)}&filter=ALL`
        );

        if (!response.ok) {
          throw new Error("バーコード検索に失敗しました");
        }

        const data: Inventory[] = await response.json();
        setItems(data);

        if (data.length === 1) {
          selectItem(data[0]);
          setMessage(`読み取りました：${value}`);
        } else if (data.length === 0) {
          setMessage("対象在庫が見つかりません");
        } else {
          setMessage(`${data.length}件見つかりました`);
        }
      } catch (error) {
        console.error(error);
        setMessage("バーコード検索に失敗しました");
      }
    },
    [selected, sessionId]
  );

  const save = async () => {
    if (!selected) return;

    const countedQuantity = Number(quantity);

    if (
      !Number.isInteger(countedQuantity) ||
      countedQuantity < 0
    ) {
      setMessage("棚卸数量は0以上の整数で入力してください");
      quantityRef.current?.focus();
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/stocktake/record", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          inventoryInstanceId: selected.id,
          countedQuantity,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "保存に失敗しました");
      }

      const difference =
        countedQuantity - selected.expectedQuantity;

      // 保存後は必ず入力値を消す。
      // 連続スキャン中なら、カメラはそのままで次を読める。
      setSelected(null);
      setQuantity("");
      setKeyword("");

      setMessage(
        difference === 0
          ? "保存しました。一致です。次を読み取ってください。"
          : `保存しました。差異 ${
              difference > 0 ? "+" : ""
            }${difference}`
      );

      await Promise.all([
        fetchProgress(),
        fetchItems("", filter),
      ]);

      requestAnimationFrame(() => {
        if (!scannerOpen) {
          searchRef.current?.focus();
        }
      });
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "保存に失敗しました"
      );
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (action: Action) => {
    const confirmation =
      action === "PAUSE"
        ? "棚卸を中断しますか？入力済みの内容は残ります。"
        : action === "COMPLETE"
          ? "未棚卸の商品が残っていても終了しますか？"
          : "";

    if (confirmation && !window.confirm(confirmation)) {
      return;
    }

    try {
      const response = await fetch(
        `/api/stocktake/session/${sessionId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ?? "状態を変更できませんでした"
        );
      }

      if (action === "COMPLETE") {
        router.push(`/stocktake/${sessionId}/result`);
        return;
      }

      await fetchProgress();

      setMessage(
        action === "PAUSE"
          ? "中断しました。開始画面から再開できます。"
          : "棚卸を再開しました。"
      );
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "状態の変更に失敗しました"
      );
    }
  };

  const difference = selected
    ? Number(quantity || 0) - selected.expectedQuantity
    : 0;

  const inputPanel = selected && (
    <div className="rounded-2xl bg-white p-4 text-slate-900 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-blue-600">
            棚卸入力
          </p>

          <h2 className="mt-1 truncate text-lg font-bold">
            {selected.item.name}
          </h2>

          <p className="mt-1 text-sm text-slate-600">
            現在庫：{selected.expectedQuantity}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setQuantity("");
          }}
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm"
        >
          戻る
        </button>
      </div>

      <label className="mt-4 block text-sm font-bold">
        棚卸数量
      </label>

      <input
        ref={quantityRef}
        type="number"
        min="0"
        inputMode="numeric"
        value={quantity}
        disabled={!canEdit || saving}
        onChange={(event) => setQuantity(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
        }}
        className="mt-1 w-full rounded-xl border-2 border-slate-300 p-3 text-3xl font-bold outline-none focus:border-blue-600"
      />

      <p
        className={`mt-3 rounded-xl p-3 font-bold ${
          difference === 0
            ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-700"
        }`}
      >
        差異：{difference > 0 ? "+" : ""}
        {difference}
      </p>

      <button
        type="button"
        onClick={save}
        disabled={!canEdit || saving}
        className="mt-3 w-full rounded-xl bg-blue-600 py-3 text-lg font-bold text-white hover:bg-blue-700 disabled:bg-slate-400"
      >
        {saving
          ? "保存中..."
          : difference === 0
            ? "一致で保存して次へ"
            : "保存して次へ"}
      </button>
    </div>
  );

  return (
    <main
      className={`mx-auto min-h-screen max-w-7xl p-4 text-white sm:p-6 lg:p-8 ${
        selected ? "pb-48 lg:pb-8" : ""
      }`}
    >
      <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">
            {progress?.session.title ?? "棚卸"}
          </h1>

          <p className="mt-1 text-sm text-slate-300">
            対象：{progress?.session.scopeLabel ?? "全在庫"}
          </p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            disabled={!canEdit}
            className="shrink-0 rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold hover:bg-slate-700 disabled:bg-slate-500"
          >
            連続スキャン
          </button>

          {progress?.session.status === "IN_PROGRESS" && (
            <button
              type="button"
              onClick={() => changeStatus("PAUSE")}
              className="shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold"
            >
              中断
            </button>
          )}

          {progress?.session.status === "PAUSED" && (
            <button
              type="button"
              onClick={() => changeStatus("RESUME")}
              className="shrink-0 rounded-xl bg-green-600 px-3 py-2 text-sm font-bold"
            >
              再開
            </button>
          )}

          {progress?.session.status !== "COMPLETED" && (
            <button
              type="button"
              onClick={() => changeStatus("COMPLETE")}
              className="shrink-0 rounded-xl bg-slate-700 px-3 py-2 text-sm font-bold"
            >
              終了
            </button>
          )}

          <Link
            href={`/stocktake/${sessionId}/result`}
            className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold"
          >
            結果
          </Link>
        </div>
      </header>

      {progress && (
        <section className="mb-4 rounded-2xl bg-white p-4 text-slate-900 sm:p-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm text-slate-500">
                棚卸進捗
              </p>

              <p className="text-2xl font-bold">
                {progress.summary.recordedCount}
                <span className="text-base font-normal text-slate-500">
                  {" "}
                  / {progress.summary.targetCount} 件
                </span>
              </p>
            </div>

            <p className="text-2xl font-bold text-blue-600">
              {progress.summary.progressPercent}%
            </p>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{
                width: `${progress.summary.progressPercent}%`,
              }}
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-100 p-2">
              <p className="text-xs text-slate-500">一致</p>
              <p className="text-xl font-bold text-green-600">
                {progress.summary.matchedCount}
              </p>
            </div>

            <div className="rounded-xl bg-slate-100 p-2">
              <p className="text-xs text-slate-500">差異</p>
              <p className="text-xl font-bold text-red-600">
                {progress.summary.differenceCount}
              </p>
            </div>

            <div className="rounded-xl bg-slate-100 p-2">
              <p className="text-xs text-slate-500">未棚卸</p>
              <p className="text-xl font-bold text-orange-600">
                {progress.summary.unrecordedCount}
              </p>
            </div>
          </div>
        </section>
      )}

      {message && (
        <p className="mb-3 rounded-xl bg-blue-100 px-4 py-3 text-sm text-blue-950">
          {message}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section>
          <input
            ref={searchRef}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                scanBarcode(keyword);
              }
            }}
            placeholder="JAN・バーコード・商品名で検索"
            className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none focus:border-blue-600"
          />

          <div className="my-3 flex gap-2 overflow-x-auto pb-1">
            {filters.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFilter(value);
                  setSelected(null);
                }}
                className={`shrink-0 rounded-full px-4 py-2 font-bold ${
                  filter === value
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loadingItems ? (
            <div className="rounded-2xl bg-white p-5 text-slate-600">
              読み込み中...
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const itemDifference =
                  item.countedQuantity === null
                    ? null
                    : item.countedQuantity - item.expectedQuantity;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectItem(item)}
                    className="w-full rounded-2xl bg-white p-4 text-left text-slate-900 shadow hover:ring-2 hover:ring-blue-500"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold">
                          {item.item.name}
                        </h2>

                        <p className="mt-1 text-sm text-slate-600">
                          JAN：{item.item.janCode ?? "-"}
                        </p>

                        <p className="text-sm text-slate-600">
                          保管場所：
                          {item.storageLocation?.name ?? "未設定"}
                        </p>

                        <p className="mt-2 font-bold text-blue-600">
                          現在庫：{item.expectedQuantity}
                        </p>
                      </div>

                      <span
                        className={`h-fit shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
                          !item.isRecorded
                            ? "bg-orange-100 text-orange-700"
                            : itemDifference === 0
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {!item.isRecorded
                          ? "未棚卸"
                          : itemDifference === 0
                            ? "一致"
                            : `差異 ${
                                itemDifference && itemDifference > 0
                                  ? "+"
                                  : ""
                              }${itemDifference}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="hidden lg:block">
          {inputPanel}
        </aside>
      </div>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-slate-100 p-3 shadow-2xl lg:hidden">
          {inputPanel}
        </div>
      )}

      {scannerOpen && (
        <BarcodeCamera
          onDetected={scanBarcode}
          onClose={() => setScannerOpen(false)}
        >
          {selected && (
            <div className="max-h-[55vh] overflow-y-auto">
              {inputPanel}
            </div>
          )}
        </BarcodeCamera>
      )}
    </main>
  );
}