"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BarcodeCamera from "@/components/stocktake/BarcodeCamera";
import CategoryQrScanner from "@/components/CategoryQrScanner";
import UnregisteredItemDialog from "@/components/stocktake/UnregisteredItemDialog";
import ProductDetailPanel from "@/components/ProductDetailPanel";
import AdminModeDialog from "@/components/stocktake/AdminModeDialog";
import { saveStocktakeRecord } from "@/lib/stocktake-record-client";

type Filter = "ALL" | "UNRECORDED" | "RECORDED" | "DIFFERENCE";
type ConfirmAction = "PAUSE" | "COMPLETE" | null;

type Inventory = {
  id: string;
  expectedQuantity: number;
  isRecorded: boolean;
  countedQuantity: number | null;
  lotNo: string | null;
  expirationDate: string | null;
  unit: string | null;
  stocktakeStatus: string | null;
  stocktakeAt: string | null;
  updatedAt: string | null;
  item: {
    id?: string;
    name: string;
    janCode: string | null;
    systemBarcode: string | null;
    managementCode: string | null;
    managementGroupCode: string | null;
    manufacturer: string | null;
    majorCategory: string | null;
    minorCategory: string | null;
    defaultUnit: string | null;
  };
  storageLocation: {
    id?: string;
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

type RegisteredTarget = {
  id: string;
  expectedQuantity: number;
  isRecorded: boolean;
  countedQuantity: number | null;
  item: {
    id: string;
    name: string;
    janCode: string | null;
    systemBarcode: string | null;
    managementCode: string | null;
  };
  storageLocation: {
    id: string;
    name: string;
  } | null;
};

type SystemError = {
  code: string;
  title: string;
  message: string;
} | null;

const filterOptions: Array<[Filter, string]> = [
  ["UNRECORDED", "未棚卸のみ"],
  ["RECORDED", "棚卸済み"],
  ["DIFFERENCE", "差異あり"],
  ["ALL", "すべて"],
];

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ja-JP");
}

function normalizeCode(value: string | null | undefined) {
  return normalizeText(value).replace(/[\s-]/g, "");
}

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
      `サーバーから応答を確認できませんでした（HTTP ${response.status}）。`
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `サーバーから正しい応答を確認できませんでした（HTTP ${response.status}）。`
    );
  }
}

export default function StocktakePage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const router = useRouter();

  const searchRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const adminTapTimesRef = useRef<number[]>([]);
  const scanLockedRef = useRef(false);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [items, setItems] = useState<Inventory[]>([]);
  const [selected, setSelected] = useState<Inventory | null>(null);

  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<Filter>("UNRECORDED");
  const [majorCategory, setMajorCategory] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [singleCameraOpen, setSingleCameraOpen] = useState(false);
  const [continuousCameraOpen, setContinuousCameraOpen] = useState(false);
  const [categoryCameraOpen, setCategoryCameraOpen] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);

  const [message, setMessage] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [systemError, setSystemError] = useState<SystemError>(null);
  const [confirmAction, setConfirmAction] =
    useState<ConfirmAction>(null);

  const [adminModeOpen, setAdminModeOpen] = useState(false);
  const [adminMode, setAdminMode] = useState<{
    id: string;
    username: string;
    displayName: string;
  } | null>(null);

  const canEdit =
    progress?.session.status === "IN_PROGRESS" &&
    !saving &&
    !systemError;

  const fetchProgress = useCallback(async () => {
    const response = await fetch(
      `/api/stocktake/session/${encodeURIComponent(sessionId)}/progress`,
      { cache: "no-store" }
    );

    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(
        getMessage(data, "棚卸進捗を取得できませんでした。")
      );
    }

    setProgress(data as Progress);
  }, [sessionId]);

  const fetchItems = useCallback(
    async (
      nextKeyword: string,
      nextFilter: Filter,
      nextMajorCategory: string | null
    ) => {
      const params = new URLSearchParams({
        sessionId,
        q: nextKeyword,
        filter: nextFilter,
      });

      if (nextMajorCategory) {
        params.set("majorCategory", nextMajorCategory);
      }

      const response = await fetch(
        `/api/inventory/search?${params.toString()}`,
        { cache: "no-store" }
      );

      const data = await readJson(response);

      if (!response.ok || !Array.isArray(data)) {
        throw new Error(
          getMessage(data, "棚卸対象の商品を取得できませんでした。")
        );
      }

      return data as Inventory[];
    },
    [sessionId]
  );

  const loadList = useCallback(
    async (
      nextKeyword: string,
      nextFilter: Filter,
      nextMajorCategory: string | null,
      showLoading = true
    ) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (showLoading) {
        setLoading(true);
      }

      try {
        const [nextItems] = await Promise.all([
          fetchItems(nextKeyword, nextFilter, nextMajorCategory),
          fetchProgress(),
        ]);

        if (requestId !== requestIdRef.current) {
          return;
        }

        setItems(nextItems);
        setSystemError(null);
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setSystemError({
          code: "STOCKTAKE_LIST_500",
          title: "棚卸対象を読み込めませんでした",
          message:
            error instanceof Error
              ? error.message
              : "棚卸対象の読み込み中にエラーが発生しました。",
        });
      } finally {
  if (requestId === requestIdRef.current) {
    setLoading(false);
  }
}
    },
    [fetchItems, fetchProgress]
  );

  useEffect(() => {
    void loadList("", "UNRECORDED", null);
  }, [loadList]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadList(keyword, filter, majorCategory, false);
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [keyword, filter, majorCategory, loadList]);

  const changeFilter = (nextFilter: Filter) => {
    if (!canEdit) {
      return;
    }

    setFilter(nextFilter);
    setSelected(null);
    setQuantity("");
    setMessage("");

    void loadList(keyword, nextFilter, majorCategory);
  };

  const selectItem = (item: Inventory) => {
    if (!canEdit) {
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

  const scanBarcode = useCallback(
    async (barcode: string, autoSelect: boolean) => {
      if (!canEdit || scanLockedRef.current) {
        return;
      }

      const value = barcode.trim();

      if (!value) {
        return;
      }

      scanLockedRef.current = true;
      setScanMessage(`読み取りました：${value}`);

      try {
        const results = await fetchItems(
          value,
          "ALL",
          majorCategory
        );

        const normalizedValue = normalizeCode(value);

        const exactMatches = results.filter((item) =>
          [
            item.item.janCode,
            item.item.systemBarcode,
            item.item.managementCode,
          ].some((code) => normalizeCode(code) === normalizedValue)
        );

        const target =
          exactMatches.length === 1
            ? exactMatches[0]
            : results.length === 1
              ? results[0]
              : null;

        if (!target) {
          if (results.length === 0) {
            setKeyword(value);
            setRegisterDialogOpen(true);
            setScanMessage(
              "登録されていない商品です。商品登録を行えます。"
            );
            return;
          }

          setItems(results);
          setScanMessage(
            "候補が複数あります。該当する商品を選んでください。"
          );
          return;
        }

        setKeyword(value);
        setItems([target]);

        if (autoSelect) {
          selectItem(target);
        }
      } catch (error) {
        setSystemError({
          code: "STOCKTAKE_BARCODE_SEARCH_500",
          title: "バーコード検索に失敗しました",
          message:
            error instanceof Error
              ? error.message
              : "バーコード検索中にエラーが発生しました。",
        });
      } finally {
        window.setTimeout(() => {
          scanLockedRef.current = false;
        }, 900);
      }
    },
    [canEdit, fetchItems, majorCategory]
  );

  const save = async () => {
    if (!selected || !canEdit) {
      return;
    }

    const countedQuantity = Number(quantity);

    if (!Number.isInteger(countedQuantity) || countedQuantity < 0) {
      setMessage("棚卸数量は0以上の整数で入力してください。");
      quantityRef.current?.focus();
      return;
    }

    setSaving(true);

    try {
      await saveStocktakeRecord({
        sessionId,
        inventoryInstanceId: selected.id,
        countedQuantity,
      });

      const difference = countedQuantity - selected.expectedQuantity;

      setMessage(
        difference === 0
          ? `${selected.item.name} を一致で保存しました。`
          : `${selected.item.name} を差異 ${difference > 0 ? "+" : ""}${difference} で保存しました。`
      );

      setSelected(null);
      setQuantity("");
      setKeyword("");

      await loadList("", filter, majorCategory, false);

      requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
    } catch (error) {
      setSystemError({
        code: "STOCKTAKE_RECORD_500",
        title: "棚卸を保存できませんでした",
        message:
          error instanceof Error
            ? error.message
            : "棚卸保存中にエラーが発生しました。",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (
    action: "PAUSE" | "RESUME" | "COMPLETE"
  ) => {
    const response = await fetch(
      `/api/stocktake/session/${encodeURIComponent(sessionId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      }
    );

    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(
        getMessage(data, "棚卸状態を変更できませんでした。")
      );
    }
  };

  const pauseStocktake = async () => {
    try {
      await updateStatus("PAUSE");
      setConfirmAction(null);
      setSingleCameraOpen(false);
      setContinuousCameraOpen(false);
      setCategoryCameraOpen(false);
      setSelected(null);
      setQuantity("");
      setMessage("棚卸を中断しました。開始画面へ戻ります。");

      window.setTimeout(() => {
        router.replace("/stocktake/start");
      }, 1800);
    } catch (error) {
      setSystemError({
        code: "STOCKTAKE_PAUSE_500",
        title: "棚卸を中断できませんでした",
        message:
          error instanceof Error
            ? error.message
            : "棚卸中断中にエラーが発生しました。",
      });
    }
  };

  const resumeStocktake = async () => {
    try {
      await updateStatus("RESUME");
      setMessage("棚卸を再開しました。");
      await loadList(keyword, filter, majorCategory);
    } catch (error) {
      setSystemError({
        code: "STOCKTAKE_RESUME_500",
        title: "棚卸を再開できませんでした",
        message:
          error instanceof Error
            ? error.message
            : "棚卸再開中にエラーが発生しました。",
      });
    }
  };

  const completeStocktake = async () => {
    try {
      await updateStatus("COMPLETE");
      setConfirmAction(null);
      router.push(`/stocktake/${sessionId}/result`);
    } catch (error) {
      setSystemError({
        code: "STOCKTAKE_COMPLETE_500",
        title: "棚卸を終了できませんでした",
        message:
          error instanceof Error
            ? error.message
            : "棚卸終了中にエラーが発生しました。",
      });
    }
  };

  const applyMajorCategory = async (category: string) => {
    const normalizedCategory = category.trim();

    if (!normalizedCategory || !canEdit) {
      return;
    }

    setMajorCategory(normalizedCategory);
    setKeyword("");
    setFilter("UNRECORDED");
    setSelected(null);
    setQuantity("");
    setCategoryCameraOpen(false);

    await loadList("", "UNRECORDED", normalizedCategory);
  };

  const clearMajorCategory = () => {
    setMajorCategory(null);
    setKeyword("");
    setFilter("UNRECORDED");
    setSelected(null);
    setQuantity("");

    void loadList("", "UNRECORDED", null);
  };

  const handleRegistered = (target: RegisteredTarget) => {
    const registeredItem: Inventory = {
      id: target.id,
      expectedQuantity: target.expectedQuantity,
      isRecorded: target.isRecorded,
      countedQuantity: target.countedQuantity,
      lotNo: null,
      expirationDate: null,
      unit: null,
      stocktakeStatus: "未棚卸",
      stocktakeAt: null,
      updatedAt: null,
      item: {
        ...target.item,
        managementGroupCode: null,
        manufacturer: null,
        majorCategory: null,
        minorCategory: null,
        defaultUnit: null,
      },
      storageLocation: target.storageLocation,
    };

    setRegisterDialogOpen(false);
    setItems((current) => [
      registeredItem,
      ...current.filter((item) => item.id !== registeredItem.id),
    ]);
    selectItem(registeredItem);

    void fetchProgress();
  };

  const openAdminMode = () => {
    const now = Date.now();

    adminTapTimesRef.current = [
      ...adminTapTimesRef.current.filter((time) => now - time < 900),
      now,
    ];

    if (adminTapTimesRef.current.length >= 3) {
      adminTapTimesRef.current = [];
      setAdminModeOpen(true);
    }
  };

  const difference =
    selected && Number.isInteger(Number(quantity))
      ? Number(quantity) - selected.expectedQuantity
      : null;

  const statusLabel =
    progress?.session.status === "PAUSED"
      ? "中断中"
      : progress?.session.status === "COMPLETED"
        ? "終了済み"
        : "棚卸中";

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-col gap-4 text-white lg:flex-row lg:items-start lg:justify-between">
          <div>
            <button
              type="button"
              onClick={openAdminMode}
              className="cursor-default select-none text-left text-sm font-semibold text-blue-300"
            >
              棚卸作業
            </button>

            <h1 className="mt-1 text-3xl font-black tracking-tight">
              {progress?.session.title ?? "棚卸"}
            </h1>

            <p className="mt-2 text-sm text-slate-300">
              対象：{progress?.session.scopeLabel ?? "全在庫"}
            </p>

            <p className="mt-1 text-sm text-slate-300">
              状態：<span className="font-bold">{statusLabel}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {adminMode && (
              <button
                type="button"
                onClick={() => setRegisterDialogOpen(true)}
                className="rounded-xl bg-violet-600 px-4 py-3 font-bold text-white"
              >
                管理者：商品登録
              </button>
            )}

            {progress?.session.status === "IN_PROGRESS" && (
              <>
                <button
                  type="button"
                  onClick={() => setCategoryCameraOpen(true)}
                  className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white"
                >
                  大分類QR
                </button>

                <button
                  type="button"
                  onClick={() => setContinuousCameraOpen(true)}
                  className="rounded-xl bg-slate-700 px-4 py-3 font-bold text-white"
                >
                  連続スキャン
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmAction("PAUSE")}
                  className="rounded-xl bg-orange-500 px-4 py-3 font-bold text-white"
                >
                  中断
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmAction("COMPLETE")}
                  className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"
                >
                  終了
                </button>
              </>
            )}

            {progress?.session.status === "PAUSED" && (
              <button
                type="button"
                onClick={() => void resumeStocktake()}
                className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white"
              >
                再開する
              </button>
            )}
          </div>
        </header>

        {progress && (
          <section className="mb-5 rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  棚卸進捗
                </p>
                <p className="mt-1 text-3xl font-black sm:text-4xl">
                  {progress.summary.recordedCount}
                  <span className="mx-1 text-lg font-medium text-slate-500">
                    /
                  </span>
                  <span className="text-lg font-semibold text-slate-600 sm:text-2xl">
                    {progress.summary.targetCount} 件
                  </span>
                </p>
              </div>

              <p className="text-3xl font-black text-blue-600">
                {progress.summary.progressPercent}%
              </p>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{
                  width: `${progress.summary.progressPercent}%`,
                }}
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
              <div className="rounded-2xl bg-slate-100 px-3 py-3 text-center">
                <p className="text-xs text-slate-500">一致</p>
                <p className="mt-1 text-2xl font-black text-emerald-600">
                  {progress.summary.matchedCount}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-100 px-3 py-3 text-center">
                <p className="text-xs text-slate-500">差異</p>
                <p className="mt-1 text-2xl font-black text-red-600">
                  {progress.summary.differenceCount}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-100 px-3 py-3 text-center">
                <p className="text-xs text-slate-500">未棚卸</p>
                <p className="mt-1 text-2xl font-black text-orange-600">
                  {progress.summary.unrecordedCount}
                </p>
              </div>
            </div>
          </section>
        )}

        {majorCategory && (
          <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-indigo-200 bg-indigo-50 p-5">
            <div>
              <p className="text-sm font-bold text-indigo-700">
                大分類ごと棚卸中
              </p>
              <h2 className="mt-1 text-2xl font-black text-indigo-950">
                {majorCategory}
              </h2>
            </div>

            <button
              type="button"
              onClick={clearMajorCategory}
              className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-indigo-800 shadow-sm"
            >
              大分類棚卸を終了
            </button>
          </section>
        )}

        {message && (
          <section className="mb-5 rounded-2xl bg-white px-4 py-3 font-medium text-slate-700">
            {message}
          </section>
        )}

        {scanMessage && (
          <section className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 font-bold text-blue-900">
            {scanMessage}
          </section>
        )}

        {progress?.session.status === "PAUSED" && (
          <section className="mb-5 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-black text-amber-900">
              棚卸は中断中です
            </h2>
            <p className="mt-1 text-sm text-amber-800">
              再開するまで、検索・カメラ・棚卸入力は使用できません。
            </p>
          </section>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-5">
              <div className="flex gap-2">
                <input
                  ref={searchRef}
                  value={keyword}
                  disabled={!canEdit}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="JAN・商品名・メーカー・分類・保管場所で検索"
                  className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 px-4 py-3 text-base outline-none focus:border-blue-500 disabled:bg-slate-100"
                />

                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setSingleCameraOpen(true)}
                  className="rounded-2xl bg-blue-600 px-4 py-3 text-xl text-white disabled:bg-slate-300"
                  aria-label="カメラで読み取る"
                >
                  📷
                </button>
              </div>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {filterOptions.map(([filterValue, label]) => (
                  <button
                    key={filterValue}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => changeFilter(filterValue)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
                      filter === filterValue
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700"
                    } disabled:opacity-50`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {loading ? (
              <section className="rounded-3xl bg-white p-10 text-center text-slate-500 shadow-sm">
                棚卸対象を読み込んでいます…
              </section>
            ) : items.length === 0 ? (
              <section className="rounded-3xl bg-white p-8 text-center shadow-sm">
                <p className="text-lg font-bold text-slate-700">
                  この条件に一致する棚卸対象はありません。
                </p>

                {adminMode && canEdit && (
                  <button
                    type="button"
                    onClick={() => setRegisterDialogOpen(true)}
                    className="mt-5 rounded-2xl bg-violet-600 px-5 py-3 font-bold text-white"
                  >
                    ＋ 未登録商品を登録
                  </button>
                )}
              </section>
            ) : (
              <section className="space-y-3">
                {items.map((item) => {
                  const itemDifference =
                    item.countedQuantity === null
                      ? null
                      : item.countedQuantity - item.expectedQuantity;

                  const status =
                    !item.isRecorded
                      ? "未棚卸"
                      : itemDifference === 0
                        ? "一致"
                        : "差異あり";

                  const statusClass =
                    !item.isRecorded
                      ? "bg-orange-100 text-orange-700"
                      : itemDifference === 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700";

                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => selectItem(item)}
                      className={`w-full rounded-3xl bg-white p-5 text-left shadow-sm transition hover:shadow-md disabled:opacity-60 ${
                        selected?.id === item.id
                          ? "ring-2 ring-blue-500"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-black text-slate-900 sm:text-xl">
                            {item.item.name}
                          </h2>

                          <p className="mt-2 text-sm text-slate-600">
                            JAN：{item.item.janCode ?? item.item.systemBarcode ?? "-"}
                          </p>

                          <p className="mt-1 text-sm text-slate-600">
                            保管場所：{item.storageLocation?.name ?? "未設定"}
                          </p>

                          <p className="mt-2 font-bold text-blue-600">
                            現在庫：{item.expectedQuantity}
                            {item.unit ?? item.item.defaultUnit ?? ""}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${statusClass}`}
                        >
                          {status}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </section>
            )}
          </div>

          <aside className="xl:sticky xl:top-5 xl:self-start">
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black">棚卸入力</h2>

              {!selected ? (
                <div className="mt-4 rounded-2xl bg-slate-100 p-5 text-sm leading-6 text-slate-600">
                  商品カードを選ぶか、バーコードを読み取ってください。
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <ProductDetailPanel
                    compact
                    product={{
                      name: selected.item.name,
                      janCode: selected.item.janCode,
                      systemBarcode: selected.item.systemBarcode,
                      managementCode: selected.item.managementCode,
                      managementGroupCode:
                        selected.item.managementGroupCode,
                      manufacturer: selected.item.manufacturer,
                      majorCategory: selected.item.majorCategory,
                      minorCategory: selected.item.minorCategory,
                      defaultUnit: selected.item.defaultUnit,
                      storageLocationName:
                        selected.storageLocation?.name,
                      lotNo: selected.lotNo,
                      expirationDate: selected.expirationDate,
                      expectedQuantity: selected.expectedQuantity,
                      countedQuantity: selected.countedQuantity,
                      stocktakeStatus: selected.stocktakeStatus,
                      stocktakeAt: selected.stocktakeAt,
                      updatedAt: selected.updatedAt,
                    }}
                  />

                  <label className="block">
                    <span className="font-bold">棚卸数量</span>
                    <input
                      ref={quantityRef}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      disabled={!canEdit}
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      className="mt-2 w-full rounded-2xl border-2 border-blue-500 px-4 py-4 text-3xl font-black outline-none disabled:bg-slate-100"
                    />
                  </label>

                  <div
                    className={`rounded-2xl p-4 font-bold ${
                      difference === null
                        ? "bg-slate-100 text-slate-700"
                        : difference === 0
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    差異：
                    {difference === null
                      ? "-"
                      : `${difference > 0 ? "+" : ""}${difference}`}
                  </div>

                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => void save()}
                    className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-black text-white disabled:bg-slate-300"
                  >
                    {saving ? "保存中…" : "棚卸を保存"}
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setSelected(null);
                      setQuantity("");
                      searchRef.current?.focus();
                    }}
                    className="w-full rounded-2xl bg-slate-100 py-3 font-bold text-slate-700"
                  >
                    入力をやめる
                  </button>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      {singleCameraOpen && (
        <BarcodeCamera
          closeOnDetect
          onDetected={(barcode) => {
            void scanBarcode(barcode, true);
          }}
          onClose={() => setSingleCameraOpen(false)}
        />
      )}

      {continuousCameraOpen && (
        <BarcodeCamera
          onDetected={(barcode) => {
            void scanBarcode(barcode, true);
          }}
          onClose={() => setContinuousCameraOpen(false)}
        >
          <section className="rounded-2xl bg-white p-5 text-center shadow-sm">
            <p className="text-sm font-bold text-blue-600">
              連続スキャン中
            </p>
            <p className="mt-2 text-lg font-black text-slate-900">
              {scanMessage || "次の商品を読み取ってください。"}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              数量を確認して保存後、そのまま次の商品を読み取れます。
            </p>
          </section>
        </BarcodeCamera>
      )}

      {categoryCameraOpen && (
        <CategoryQrScanner
          currentCategory={majorCategory}
          onDetected={(category) => {
            void applyMajorCategory(category);
          }}
          onClose={() => setCategoryCameraOpen(false)}
        />
      )}

      <UnregisteredItemDialog
        open={registerDialogOpen}
        sessionId={sessionId}
        initialJanCode={keyword}
        onClose={() => setRegisterDialogOpen(false)}
        onRegistered={handleRegistered}
      />

      <AdminModeDialog
        open={adminModeOpen}
        sessionId={sessionId}
        onClose={() => setAdminModeOpen(false)}
        onAuthenticated={(admin) => {
          setAdminMode(admin);
          setAdminModeOpen(false);
          setMessage(`管理者モードを開始しました：${admin.displayName}`);
        }}
      />

      {confirmAction && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/70 p-4">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-black text-slate-900">
              {confirmAction === "PAUSE"
                ? "棚卸を中断しますか？"
                : "棚卸を終了しますか？"}
            </h2>

            <p className="mt-3 leading-6 text-slate-600">
              {confirmAction === "PAUSE"
                ? "保存済みの棚卸データは残ります。中断後は開始画面から再開できます。"
                : "未棚卸の商品が残っていても終了できます。次に結果画面で内容を確認します。"}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-2xl bg-slate-100 px-4 py-3 font-bold text-slate-700"
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirmAction === "PAUSE") {
                    void pauseStocktake();
                  } else {
                    void completeStocktake();
                  }
                }}
                className={`rounded-2xl px-4 py-3 font-bold text-white ${
                  confirmAction === "PAUSE"
                    ? "bg-orange-500"
                    : "bg-blue-600"
                }`}
              >
                実行する
              </button>
            </div>
          </section>
        </div>
      )}

      {systemError && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/70 p-4">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-sm font-bold text-red-600">
              システム保護エラー
            </p>

            <h2 className="mt-2 text-2xl font-black text-slate-900">
              {systemError.title}
            </h2>

            <p className="mt-4 leading-7 text-slate-600">
              {systemError.message}
            </p>

            <p className="mt-5 rounded-xl bg-slate-100 px-3 py-2 font-mono text-xs text-slate-600">
              エラーコード：{systemError.code}
            </p>

            <button
              type="button"
              onClick={() => router.replace("/stocktake/start")}
              className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white"
            >
              棚卸開始画面へ戻る
            </button>
          </section>
        </div>
      )}
    </main>
  );
}