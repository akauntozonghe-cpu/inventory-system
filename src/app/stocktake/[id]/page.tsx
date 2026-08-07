"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import BarcodeCamera from "@/components/stocktake/BarcodeCamera";

type Filter =
  | "ALL"
  | "UNRECORDED"
  | "RECORDED"
  | "DIFFERENCE";

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
  storageLocation: {
    name: string;
  } | null;
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

const filters: Array<{
  value: Filter;
  label: string;
}> = [
  { value: "UNRECORDED", label: "未棚卸のみ" },
  { value: "RECORDED", label: "棚卸済み" },
  { value: "DIFFERENCE", label: "差異あり" },
  { value: "ALL", label: "すべて" },
];

export default function StocktakePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;

  const quantityRef = useRef<HTMLInputElement>(null);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [items, setItems] = useState<Inventory[]>([]);
  const [selected, setSelected] = useState<Inventory | null>(null);

  const [filter, setFilter] =
    useState<Filter>("UNRECORDED");

  const [keyword, setKeyword] = useState("");
  const [quantity, setQuantity] = useState("");

  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [message, setMessage] = useState("");

  const canEdit = progress?.session.status === "IN_PROGRESS";

  const fetchProgress = useCallback(async () => {
    const response = await fetch(
      `/api/stocktake/session/${sessionId}/progress`
    );

    if (!response.ok) {
      throw new Error("進捗を取得できませんでした");
    }

    const data: Progress = await response.json();
    setProgress(data);
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

        const data: Inventory[] = await response.json();
        setItems(data);
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
    const timer = window.setTimeout(() => {
      fetchItems();
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [fetchItems]);

  const selectItem = (item: Inventory) => {
    if (!canEdit) {
      setMessage("中断中または終了済みの棚卸は編集できません");
      return;
    }

    setMessage("");
    setSelected(item);

    // 既に入力済みならその数、未入力なら現在庫を自動入力
    setQuantity(
      String(
        item.countedQuantity ??
          item.expectedQuantity
      )
    );

    requestAnimationFrame(() => {
      quantityRef.current?.focus();
      quantityRef.current?.select();
    });
  };

  const searchBarcode = useCallback(
    async (barcode: string) => {
      const value = barcode.trim();

      if (!value) {
        return;
      }

      setKeyword(value);
      setMessage(`読み取り：${value}`);

      try {
        const response = await fetch(
          `/api/inventory/search?sessionId=${encodeURIComponent(
            sessionId
          )}&q=${encodeURIComponent(
            value
          )}&filter=ALL`
        );

        if (!response.ok) {
          throw new Error("検索に失敗しました");
        }

        const data: Inventory[] = await response.json();
        setItems(data);

        if (data.length === 1) {
          selectItem(data[0]);
        } else if (data.length === 0) {
          setMessage(
            `「${value}」に該当する対象在庫がありません`
          );
        } else {
          setMessage(
            `${data.length}件見つかりました。商品を選んでください`
          );
        }
      } catch (error) {
        console.error(error);
        setMessage("バーコード検索に失敗しました");
      }
    },
    [sessionId]
  );

  const saveRecord = async () => {
    if (!selected) {
      return;
    }

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
    setMessage("");

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
        throw new Error(
          data.message ?? "保存に失敗しました"
        );
      }

      const difference =
        countedQuantity - selected.expectedQuantity;

      setMessage(
        difference === 0
          ? "棚卸を保存しました（一致）"
          : `棚卸を保存しました（差異 ${
              difference > 0 ? "+" : ""
            }${difference}）`
      );

      setSelected(null);
      setQuantity("");

      await Promise.all([
        fetchProgress(),
        fetchItems(),
      ]);
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
    if (
      action === "PAUSE" &&
      !window.confirm(
        "棚卸を中断しますか？入力済みの内容は保存されたままです。"
      )
    ) {
      return;
    }

    if (
      action === "COMPLETE" &&
      !window.confirm(
        "棚卸を終了しますか？未棚卸の商品が残っていても終了できます。"
      )
    ) {
      return;
    }

    setChangingStatus(true);
    setMessage("");

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
          ? "棚卸を中断しました。開始画面から再開できます。"
          : "棚卸を再開しました。"
      );
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "状態の変更に失敗しました"
      );
    } finally {
      setChangingStatus(false);
    }
  };

  const selectedDifference = selected
    ? Number(quantity || 0) -
      selected.expectedQuantity
    : 0;

  return (
    <main className="mx-auto min-h-screen max-w-7xl p-4 text-white sm:p-6 lg:p-8">
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">
            {progress?.session.title ?? "棚卸"}
          </h1>

          <p className="mt-1 text-sm text-slate-300">
            対象：
            {progress?.session.scopeLabel ?? "全在庫"}
          </p>

          <p className="mt-1 text-sm text-slate-300">
            状態：
            {progress?.session.status === "PAUSED"
              ? "中断中"
              : progress?.session.status === "COMPLETED"
                ? "終了済み"
                : "棚卸中"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {progress?.session.status === "IN_PROGRESS" && (
            <button
              type="button"
              onClick={() => changeStatus("PAUSE")}
              disabled={changingStatus}
              className="rounded-xl bg-orange-500 px-4 py-3 font-bold hover:bg-orange-600 disabled:opacity-60"
            >
              中断する
            </button>
          )}

          {progress?.session.status === "PAUSED" && (
            <button
              type="button"
              onClick={() => changeStatus("RESUME")}
              disabled={changingStatus}
              className="rounded-xl bg-green-600 px-4 py-3 font-bold hover:bg-green-700 disabled:opacity-60"
            >
              再開する
            </button>
          )}

          {progress?.session.status !== "COMPLETED" && (
            <button
              type="button"
              onClick={() => changeStatus("COMPLETE")}
              disabled={changingStatus}
              className="rounded-xl bg-slate-700 px-4 py-3 font-bold hover:bg-slate-600 disabled:opacity-60"
            >
              棚卸を終了する
            </button>
          )}

          <Link
            href={`/stocktake/${sessionId}/result`}
            className="rounded-xl bg-blue-600 px-4 py-3 font-bold hover:bg-blue-700"
          >
            結果を見る
          </Link>
        </div>
      </header>

      {progress && (
        <section className="mb-5 rounded-2xl bg-white p-4 text-slate-900 shadow sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">
                棚卸進捗
              </p>

              <p className="mt-1 text-2xl font-bold">
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

          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{
                width: `${progress.summary.progressPercent}%`,
              }}
            />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:gap-4">
            <div className="rounded-xl bg-slate-100 p-3">
              <p className="text-xs text-slate-500">
                一致
              </p>

              <p className="text-2xl font-bold text-green-600">
                {progress.summary.matchedCount}
              </p>
            </div>

            <div className="rounded-xl bg-slate-100 p-3">
              <p className="text-xs text-slate-500">
                差異
              </p>

              <p className="text-2xl font-bold text-red-600">
                {progress.summary.differenceCount}
              </p>
            </div>

            <div className="rounded-xl bg-slate-100 p-3">
              <p className="text-xs text-slate-500">
                未棚卸
              </p>

              <p className="text-2xl font-bold text-orange-600">
                {progress.summary.unrecordedCount}
              </p>
            </div>
          </div>
        </section>
      )}

      {message && (
        <div className="mb-4 rounded-xl bg-blue-100 px-4 py-3 text-sm font-medium text-blue-950">
          {message}
        </div>
      )}

      {!canEdit && progress && (
        <div className="mb-4 rounded-xl bg-orange-100 px-4 py-3 text-orange-950">
          {progress.session.status === "PAUSED"
            ? "棚卸は中断中です。「再開する」を押すと入力できます。"
            : "棚卸は終了済みです。結果画面から確認できます。"}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="order-2 lg:order-1">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={keyword}
              onChange={(event) =>
                setKeyword(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  searchBarcode(keyword);
                }
              }}
              placeholder="JAN・バーコード・商品名で検索"
              className="min-w-0 flex-1 rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none focus:border-blue-600"
            />

            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              disabled={!canEdit}
              className="rounded-xl bg-blue-600 px-5 py-3 font-bold hover:bg-blue-700 disabled:bg-slate-500"
            >
              📷 カメラで読む
            </button>
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setFilter(item.value);
                  setSelected(null);
                }}
                className={`whitespace-nowrap rounded-full px-4 py-2 font-bold ${
                  filter === item.value
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-700"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {loadingItems ? (
            <div className="rounded-2xl bg-white p-6 text-slate-600">
              読み込み中...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl bg-white p-6 text-slate-600">
              該当する在庫がありません。
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const difference =
                  item.countedQuantity === null
                    ? null
                    : item.countedQuantity -
                      item.expectedQuantity;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectItem(item)}
                    className={`w-full rounded-2xl bg-white p-4 text-left text-slate-900 shadow transition hover:ring-2 hover:ring-blue-500 ${
                      selected?.id === item.id
                        ? "ring-4 ring-blue-500"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-bold">
                          {item.item.name}
                        </h2>

                        <p className="mt-1 text-sm text-slate-600">
                          JAN：
                          {item.item.janCode ?? "-"}
                        </p>

                        <p className="text-sm text-slate-600">
                          保管場所：
                          {item.storageLocation?.name ?? "未設定"}
                        </p>

                        <p className="mt-2 font-bold text-blue-600">
                          現在庫：
                          {item.expectedQuantity}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
                          !item.isRecorded
                            ? "bg-orange-100 text-orange-700"
                            : difference === 0
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {!item.isRecorded
                          ? "未棚卸"
                          : difference === 0
                            ? "一致"
                            : `差異 ${
                                difference && difference > 0
                                  ? "+"
                                  : ""
                              }${difference}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="order-1 lg:order-2">
          <div className="sticky top-4 rounded-2xl bg-white p-5 text-slate-900 shadow">
            <h2 className="text-xl font-bold">
              棚卸入力
            </h2>

            {!selected ? (
              <p className="mt-4 rounded-xl bg-slate-100 p-4 text-slate-600">
                商品を選ぶか、バーコードを読み取ってください。
              </p>
            ) : (
              <>
                <div className="mt-4 rounded-xl bg-slate-100 p-4">
                  <p className="font-bold">
                    {selected.item.name}
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    保管場所：
                    {selected.storageLocation?.name ?? "未設定"}
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    現在庫：
                    {selected.expectedQuantity}
                  </p>
                </div>

                <label className="mt-5 block font-bold">
                  棚卸数量
                </label>

                <input
                  ref={quantityRef}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      saveRecord();
                    }
                  }}
                  disabled={!canEdit || saving}
                  className="mt-2 w-full rounded-xl border-2 border-slate-300 p-4 text-3xl font-bold outline-none focus:border-blue-600 disabled:bg-slate-100"
                />

                <p
                  className={`mt-3 rounded-xl p-3 font-bold ${
                    selectedDifference === 0
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  差異：
                  {selectedDifference > 0 ? "+" : ""}
                  {selectedDifference}
                </p>

                <button
                  type="button"
                  onClick={saveRecord}
                  disabled={!canEdit || saving}
                  className="mt-4 w-full rounded-xl bg-blue-600 py-4 text-lg font-bold text-white hover:bg-blue-700 disabled:bg-slate-400"
                >
                  {saving ? "保存中..." : "棚卸を保存する"}
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      {cameraOpen && (
        <BarcodeCamera
          onDetected={searchBarcode}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </main>
  );
}