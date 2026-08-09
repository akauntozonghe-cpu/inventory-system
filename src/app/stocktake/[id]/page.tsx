"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BarcodeCamera from "@/components/stocktake/BarcodeCamera";
import SystemErrorDialog from "@/components/common/SystemErrorDialog";
import UnregisteredItemDialog from "@/components/stocktake/UnregisteredItemDialog";
import { useInstantStocktake } from "@/hooks/useInstantStocktake";
import { recoverAfterFailure } from "@/lib/client-error-recovery";
import { saveStocktakeRecord } from "@/lib/stocktake-record-client";

type Filter = "ALL" | "UNRECORDED" | "RECORDED" | "DIFFERENCE";
type SessionAction = "PAUSE" | "RESUME";

type Inventory = {
  id: string;
  expectedQuantity: number;
  isRecorded: boolean;
  countedQuantity: number | null;
  item: {
    name: string;
    janCode: string | null;
    systemBarcode?: string | null;
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

type Confirmation = {
  action: "PAUSE" | "COMPLETE";
  title: string;
  message: string;
} | null;

type SearchFailure = {
  code: string;
  message: string;
  keyword: string;
  filter: Filter;
} | null;

type SafetyStop = {
  code: string;
  title: string;
  message: string;
} | null;

type PendingSave = {
  item: Inventory;
  countedQuantity: number;
  reportId: string | null;
  errorCode: string;
  errorMessage: string;
} | null;

type RegisteredInventory = {
  item: {
    id: string;
    name: string;
    janCode: string | null;
  };
  inventory: {
    id: string;
    quantity: number;
  };
};

const filters: Array<[Filter, string]> = [
  ["UNRECORDED", "未棚卸のみ"],
  ["RECORDED", "棚卸済み"],
  ["DIFFERENCE", "差異あり"],
  ["ALL", "すべて"],
];

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

function getErrorCode(data: unknown, fallback: string) {
  if (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    typeof data.code === "string"
  ) {
    return data.code;
  }

  return fallback;
}

function normalizeCode(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s-]/g, "")
    .toLowerCase();
}

export default function StocktakePage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const router = useRouter();

  const searchRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const lastActivityRef = useRef(Date.now());
  const scanningRef = useRef(false);
  const safetyStoppingRef = useRef(false);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [items, setItems] = useState<Inventory[]>([]);
  const [selected, setSelected] = useState<Inventory | null>(null);

  const [filter, setFilter] = useState<Filter>("UNRECORDED");
  const [keyword, setKeyword] = useState("");
  const [quantity, setQuantity] = useState("");

  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [singleCameraOpen, setSingleCameraOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);

  const [message, setMessage] = useState("");
  const [searchFailure, setSearchFailure] =
    useState<SearchFailure>(null);
  const [safetyStop, setSafetyStop] = useState<SafetyStop>(null);
  const [confirmation, setConfirmation] =
    useState<Confirmation>(null);
  const [pendingSave, setPendingSave] =
    useState<PendingSave>(null);
  const [retryingSave, setRetryingSave] = useState(false);

  const canEdit =
    progress?.session.status === "IN_PROGRESS" &&
    !safetyStop &&
    !searchFailure &&
    !pendingSave;

  const {
    pendingCount,
    syncing: syncingInstantRecords,
    saveInstant,
    sync: syncInstantRecords,
  } = useInstantStocktake(sessionId);

  const fetchProgress = useCallback(async () => {
    const response = await fetch(
      `/api/stocktake/session/${encodeURIComponent(sessionId)}/progress`,
      { cache: "no-store" }
    );

    const data: unknown = await response.json();

    if (!response.ok) {
      throw new Error(
        getMessage(data, "棚卸進捗を取得できませんでした。")
      );
    }

    setProgress(data as Progress);
  }, [sessionId]);

  const requestItems = useCallback(
    async (
      nextKeyword: string,
      nextFilter: Filter
    ): Promise<Inventory[]> => {
      const response = await fetch(
        `/api/inventory/search?sessionId=${encodeURIComponent(
          sessionId
        )}&q=${encodeURIComponent(
          nextKeyword
        )}&filter=${nextFilter}`,
        { cache: "no-store" }
      );

      const data: unknown = await response.json();

      if (!response.ok) {
        const error = new Error(
          getMessage(data, "在庫検索に失敗しました。")
        ) as Error & { code?: string };

        error.code = getErrorCode(
          data,
          "INVENTORY_SEARCH_500"
        );

        throw error;
      }

      if (!Array.isArray(data)) {
        const error = new Error(
          "検索結果の形式が正しくありません。"
        ) as Error & { code?: string };

        error.code = "INVENTORY_SEARCH_INVALID_RESPONSE";

        throw error;
      }

      return data as Inventory[];
    },
    [sessionId]
  );

  const fetchItems = useCallback(
    async (
      nextKeyword = "",
      nextFilter: Filter = "UNRECORDED"
    ): Promise<Inventory[] | null> => {
      setLoadingItems(true);
      setSearchFailure(null);

      try {
        const result = await recoverAfterFailure({
          code: "INVENTORY_SEARCH_500",
          title: "在庫検索を実行できませんでした",
          message: "在庫検索の通信または検索処理で異常を検知しました。",
          route: window.location.pathname,
          sessionId,
          detail: {
            keyword: nextKeyword,
            filter: nextFilter,
          },
          action: () =>
            requestItems(nextKeyword, nextFilter),
        });

        if (!result.success || !result.value) {
          setItems([]);
          setSelected(null);
          setQuantity("");
          setSearchFailure({
            code: "INVENTORY_SEARCH_500",
            message:
              "検索を自動で再試行しましたが、復旧できませんでした。",
            keyword: nextKeyword,
            filter: nextFilter,
          });

          return null;
        }

        setItems(result.value);
        return result.value;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "在庫検索に失敗しました。";

        const code =
          error instanceof Error &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : "INVENTORY_SEARCH_500";

        setItems([]);
        setSelected(null);
        setQuantity("");
        setSearchFailure({
          code,
          message,
          keyword: nextKeyword,
          filter: nextFilter,
        });

        return null;
      } finally {
        setLoadingItems(false);
      }
    },
    [requestItems, sessionId]
  );

  const updateSessionStatus = useCallback(
    async (action: SessionAction) => {
      const response = await fetch(
        `/api/stocktake/session/${encodeURIComponent(sessionId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
          keepalive: true,
        }
      );

      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getMessage(
            data,
            "棚卸状態を更新できませんでした。"
          )
        );
      }
    },
    [sessionId]
  );

  const pauseForSafety = useCallback(
    async (
      code: string,
      title: string,
      detail: string
    ) => {
      if (safetyStoppingRef.current) {
        return;
      }

      safetyStoppingRef.current = true;
      scanningRef.current = true;

      setSingleCameraOpen(false);
      setScannerOpen(false);
      setRegisterDialogOpen(false);
      setSelected(null);
      setQuantity("");

      setSafetyStop({
        code,
        title,
        message: detail,
      });

      try {
        await updateSessionStatus("PAUSE");
      } catch {
        // 通信断時でも入力を停止し、利用者の操作は保護する
      }

      window.setTimeout(() => {
        router.replace("/stocktake/start");
      }, 2200);
    },
    [router, updateSessionStatus]
  );

  const selectItem = useCallback(
    (item: Inventory) => {
      if (!canEdit) {
        setMessage(
          "棚卸作業は停止中です。再開またはエラー対応をしてください。"
        );
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
    },
    [canEdit]
  );

  const finishSaveUi = useCallback(
    (item: Inventory, countedQuantity: number) => {
      const difference =
        countedQuantity - item.expectedQuantity;

      setSelected(null);
      setQuantity("");
      setKeyword("");

      setMessage(
        difference === 0
          ? "棚卸を保存しました。一致しています。"
          : `棚卸を保存しました。差異：${
              difference > 0 ? "+" : ""
            }${difference}`
      );

      void fetchProgress();
      void fetchItems("", filter);

      requestAnimationFrame(() => {
        if (!scannerOpen) {
          searchRef.current?.focus();
        }
      });
    },
    [fetchItems, fetchProgress, filter, scannerOpen]
  );

  useEffect(() => {
    void fetchProgress().catch(() => {
      void pauseForSafety(
        "STOCKTAKE_PROGRESS_500",
        "棚卸情報を確認できませんでした",
        "安全のため棚卸作業を停止しました。保存済みの棚卸データは保護されています。"
      );
    });
  }, [fetchProgress, pauseForSafety]);

  useEffect(() => {
    void fetchItems("", filter);
  }, [fetchItems, filter]);

  useEffect(() => {
    if (
      !canEdit ||
      selected ||
      scannerOpen ||
      singleCameraOpen
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchProgress().catch(() => {
        void pauseForSafety(
          "STOCKTAKE_PROGRESS_500",
          "棚卸情報を確認できませんでした",
          "安全のため棚卸作業を停止しました。"
        );
      });
    }, 15000);

    return () => window.clearInterval(timer);
  }, [
    canEdit,
    fetchProgress,
    pauseForSafety,
    scannerOpen,
    selected,
    singleCameraOpen,
  ]);

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "input",
    ];

    events.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, {
        passive: true,
      });
    });

    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current < 30 * 60 * 1000) {
        return;
      }

      void pauseForSafety(
        "STOCKTAKE_IDLE_30MIN",
        "操作がないため棚卸を中断しました",
        "30分間操作がなかったため、安全のため棚卸を中断しました。開始画面から再開できます。"
      );
    }, 15000);

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });

      window.clearInterval(timer);
    };
  }, [canEdit, pauseForSafety]);

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    window.history.pushState(
      { stocktakeSessionId: sessionId },
      "",
      window.location.href
    );

    const handlePopState = () => {
      window.history.pushState(
        { stocktakeSessionId: sessionId },
        "",
        window.location.href
      );

      void pauseForSafety(
        "STOCKTAKE_BROWSER_BACK",
        "ブラウザの戻る操作を検知しました",
        "データの不整合を防ぐため棚卸を中断しました。保存済みの棚卸データは保護されています。"
      );
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );
    };
  }, [canEdit, pauseForSafety, sessionId]);

  const scanBarcode = useCallback(
    async (barcode: string, autoSelect: boolean) => {
      if (scanningRef.current || !canEdit || selected) {
        return;
      }

      const value = barcode.trim();

      if (!value) {
        return;
      }

      scanningRef.current = true;
      setKeyword(value);
      setMessage("");

      try {
        const results = await fetchItems(value, "ALL");

        if (!results) {
          return;
        }

        const normalizedValue = normalizeCode(value);

        const exactMatches = results.filter((item) =>
          [
            item.item.janCode,
            item.item.systemBarcode,
            item.item.managementCode,
          ].some(
            (code) =>
              normalizeCode(code) === normalizedValue
          )
        );

        const scannedItem =
          exactMatches.length === 1
            ? exactMatches[0]
            : results.length === 1
              ? results[0]
              : null;

        if (scannedItem && autoSelect) {
          selectItem(scannedItem);
          setMessage(`読み取りました：${value}`);
          return;
        }

        if (scannedItem) {
          setMessage(`読み取りました：${value}`);
          return;
        }

        if (results.length === 0) {
          setMessage(
            "該当する棚卸対象がありません。未登録商品の登録ができます。"
          );
          return;
        }

        setMessage(
          `${results.length}件見つかりました。商品を選んでください。`
        );
      } finally {
        window.setTimeout(() => {
          scanningRef.current = false;
        }, 700);
      }
    },
    [canEdit, fetchItems, selected, selectItem]
  );

  const save = async () => {
    if (!selected || !canEdit) {
      return;
    }

    const item = selected;
    const countedQuantity = Number(quantity);

    if (!Number.isInteger(countedQuantity) || countedQuantity < 0) {
      setMessage("棚卸数量は0以上の整数で入力してください。");
      quantityRef.current?.focus();
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await saveStocktakeRecord({
        sessionId,
        inventoryInstanceId: item.id,
        countedQuantity,
      });

      finishSaveUi(item, countedQuantity);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "棚卸データを保存できませんでした。";

      const result = await recoverAfterFailure({
        code: "STOCKTAKE_SAVE_001",
        title: "棚卸データを保存できませんでした",
        message: errorMessage,
        route: window.location.pathname,
        sessionId,
        detail: {
          inventoryInstanceId: item.id,
          countedQuantity,
        },
        action: () =>
          saveStocktakeRecord({
            sessionId,
            inventoryInstanceId: item.id,
            countedQuantity,
          }),
      });

      if (result.success) {
        finishSaveUi(item, countedQuantity);
        return;
      }

      setPendingSave({
        item,
        countedQuantity,
        reportId: result.reportId,
        errorCode: "STOCKTAKE_SAVE_001",
        errorMessage,
      });
    } finally {
      setSaving(false);
    }
  };

  const retryPendingSave = async () => {
    if (!pendingSave) {
      return;
    }

    setRetryingSave(true);

    try {
      const result = await recoverAfterFailure({
        code: pendingSave.errorCode,
        title: "棚卸データを保存できませんでした",
        message: pendingSave.errorMessage,
        route: window.location.pathname,
        sessionId,
        detail: {
          inventoryInstanceId: pendingSave.item.id,
          countedQuantity: pendingSave.countedQuantity,
        },
        action: () =>
          saveStocktakeRecord({
            sessionId,
            inventoryInstanceId: pendingSave.item.id,
            countedQuantity: pendingSave.countedQuantity,
          }),
      });

      if (result.success) {
        finishSaveUi(
          pendingSave.item,
          pendingSave.countedQuantity
        );

        setPendingSave(null);
      }
    } finally {
      setRetryingSave(false);
    }
  };

  const savePendingInstantly = async () => {
    if (!pendingSave) {
      return;
    }

    await saveInstant({
      inventoryInstanceId: pendingSave.item.id,
      countedQuantity: pendingSave.countedQuantity,
      errorCode: pendingSave.errorCode,
    });

    setSelected(null);
    setQuantity("");
    setKeyword("");
    setPendingSave(null);

    setMessage(
      "端末に一時保存しました。通信が復旧したら同期できます。"
    );
  };

  const changeQuantity = (amount: number) => {
    const current = Number(quantity || 0);

    setQuantity(String(Math.max(0, current + amount)));
    quantityRef.current?.focus();
  };

  const confirmAction = async () => {
    if (!confirmation) {
      return;
    }

    const action = confirmation.action;
    setConfirmation(null);

    if (action === "COMPLETE") {
      router.push(`/stocktake/${sessionId}/result`);
      return;
    }

    try {
      await updateSessionStatus("PAUSE");

      setMessage(
        "棚卸を中断しました。開始画面から再開できます。"
      );

      window.setTimeout(() => {
        router.replace("/stocktake/start");
      }, 1500);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "棚卸を中断できませんでした。"
      );
    }
  };

  const resumeStocktake = async () => {
    try {
      await updateSessionStatus("RESUME");
      await fetchProgress();
      await fetchItems("", filter);

      setMessage("棚卸を再開しました。");

      requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "棚卸を再開できませんでした。"
      );
    }
  };

  const registered = (result: RegisteredInventory) => {
    const registeredItem: Inventory = {
      id: result.inventory.id,
      expectedQuantity: result.inventory.quantity,
      isRecorded: false,
      countedQuantity: null,
      item: {
        name: result.item.name,
        janCode: result.item.janCode,
        systemBarcode: null,
        managementCode: null,
      },
      storageLocation: null,
    };

    setRegisterDialogOpen(false);
    setSearchFailure(null);
    setItems([registeredItem]);
    setKeyword("");
    setMessage(
      "商品を登録し、今回の棚卸対象へ追加しました。"
    );

    void fetchProgress();
    selectItem(registeredItem);
  };

  const difference = selected
    ? Number(quantity || 0) - selected.expectedQuantity
    : 0;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              {progress?.session.title ?? "棚卸"}
            </h1>

            <p className="mt-1 text-sm text-slate-600">
              対象：{progress?.session.scopeLabel ?? "全在庫"}
            </p>

            <p className="mt-1 text-sm text-slate-600">
              状態：
              {progress?.session.status === "PAUSED"
                ? "中断中"
                : progress?.session.status === "COMPLETED"
                  ? "確定済み"
                  : "棚卸中"}
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              disabled={!canEdit}
              className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:bg-slate-400"
            >
              連続スキャン
            </button>

            {progress?.session.status === "IN_PROGRESS" && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setConfirmation({
                      action: "PAUSE",
                      title: "棚卸を中断しますか？",
                      message:
                        "保存済みの棚卸データは残ります。開始画面から再開できます。",
                    })
                  }
                  className="shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-white"
                >
                  中断
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setConfirmation({
                      action: "COMPLETE",
                      title: "棚卸を終了しますか？",
                      message:
                        "次の画面で結果を確認し、確定できます。",
                    })
                  }
                  className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white"
                >
                  終了
                </button>
              </>
            )}

            {progress?.session.status === "PAUSED" && (
              <button
                type="button"
                onClick={() => void resumeStocktake()}
                className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
              >
                再開
              </button>
            )}
          </div>
        </header>

        {progress && (
          <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-slate-500">棚卸進捗</p>

                <p className="mt-1 text-3xl font-bold">
                  {progress.summary.recordedCount}
                  <span className="text-lg font-normal text-slate-500">
                    {" "}
                    / {progress.summary.targetCount} 件
                  </span>
                </p>
              </div>

              <p className="text-3xl font-bold text-blue-600">
                {progress.summary.progressPercent}%
              </p>
            </div>

            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{
                  width: `${progress.summary.progressPercent}%`,
                }}
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-slate-100 p-2">
                <p className="text-xs text-slate-500">一致</p>
                <p className="text-xl font-bold text-emerald-600">
                  {progress.summary.matchedCount}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-100 p-2">
                <p className="text-xs text-slate-500">差異</p>
                <p className="text-xl font-bold text-red-600">
                  {progress.summary.differenceCount}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-100 p-2">
                <p className="text-xs text-slate-500">未棚卸</p>
                <p className="text-xl font-bold text-orange-600">
                  {progress.summary.unrecordedCount}
                </p>
              </div>
            </div>
          </section>
        )}

        {message && !searchFailure && (
          <p className="mb-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {message}
          </p>
        )}

        {searchFailure && (
          <section className="mb-4 rounded-3xl border border-red-200 bg-red-50 p-5">
            <p className="text-sm font-bold text-red-600">
              システムエラー
            </p>

            <h2 className="mt-1 text-xl font-bold">
              在庫検索を完了できませんでした
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-700">
              {searchFailure.message}
            </p>

            <p className="mt-3 text-sm font-bold text-slate-600">
              エラーコード：{searchFailure.code}
            </p>

            <button
              type="button"
              onClick={() =>
                void fetchItems(
                  searchFailure.keyword,
                  searchFailure.filter
                )
              }
              className="mt-5 rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white"
            >
              検索を再試行する
            </button>
          </section>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_430px]">
          <section>
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex gap-2">
                <input
                  ref={searchRef}
                  disabled={!canEdit}
                  value={keyword}
                  onChange={(event) =>
                    setKeyword(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void scanBarcode(keyword, false);
                    }
                  }}
                  placeholder="JAN・システムバーコード・商品名で検索"
                  className="min-w-0 flex-1 rounded-2xl border-2 border-slate-300 px-4 py-3 outline-none focus:border-blue-600 disabled:bg-slate-100"
                />

                <button
                  type="button"
                  onClick={() => setSingleCameraOpen(true)}
                  disabled={!canEdit}
                  className="shrink-0 rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white disabled:bg-slate-400"
                  aria-label="カメラで読み取る"
                >
                  📷
                </button>
              </div>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {filters.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      setFilter(value);
                      setSelected(null);
                      setQuantity("");
                    }}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
                      filter === value
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {loadingItems ? (
                <div className="rounded-3xl bg-white p-6 text-slate-500 shadow-sm">
                  読み込み中…
                </div>
              ) : searchFailure ? (
                <div className="rounded-3xl bg-white p-6 text-center text-slate-500 shadow-sm">
                  エラー対応中のため、検索結果は表示しません。
                </div>
              ) : items.length === 0 ? (
                <div className="rounded-3xl bg-white p-6 text-center shadow-sm">
                  <p className="text-slate-600">
                    該当する棚卸対象がありません。
                  </p>

                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      setSingleCameraOpen(false);
                      setScannerOpen(false);
                      setRegisterDialogOpen(true);
                    }}
                    className="mt-4 rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white disabled:bg-slate-400"
                  >
                    ＋ 未登録商品を登録
                  </button>
                </div>
              ) : (
                items.map((item) => {
                  const itemDifference =
                    item.countedQuantity === null
                      ? null
                      : item.countedQuantity -
                        item.expectedQuantity;

                  const label = !item.isRecorded
                    ? "未棚卸"
                    : itemDifference === 0
                      ? "一致"
                      : `差異 ${
                          itemDifference !== null &&
                          itemDifference > 0
                            ? "+"
                            : ""
                        }${itemDifference ?? 0}`;

                  const badgeClass = !item.isRecorded
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
                      className="w-full rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-400 disabled:opacity-60"
                    >
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-lg font-bold">
                            {item.item.name}
                          </h2>

                          <p className="mt-2 text-sm text-slate-600">
                            JAN：{item.item.janCode ?? "-"}
                          </p>

                          <p className="text-sm text-slate-600">
                            保管場所：
                            {item.storageLocation?.name ?? "未設定"}
                          </p>

                          <p className="mt-3 text-lg font-bold text-blue-600">
                            現在庫：{item.expectedQuantity}
                          </p>
                        </div>

                        <span
                          className={`h-fit shrink-0 rounded-full px-3 py-1 text-sm font-bold ${badgeClass}`}
                        >
                          {label}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <aside>
            {selected ? (
              <section className="sticky top-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-blue-600">
                      棚卸入力
                    </p>

                    <h2 className="mt-1 text-xl font-bold">
                      {selected.item.name}
                    </h2>

                    <p className="mt-2 text-slate-600">
                      現在庫：{selected.expectedQuantity}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelected(null);
                      setQuantity("");
                    }}
                    disabled={saving}
                    className="h-fit rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold"
                  >
                    戻る
                  </button>
                </div>

                <label className="mt-5 block text-sm font-bold">
                  棚卸数量
                </label>

                <div className="mt-2 grid grid-cols-[64px_minmax(0,1fr)_64px] gap-3">
                  <button
                    type="button"
                    onClick={() => changeQuantity(-1)}
                    disabled={saving}
                    className="rounded-2xl bg-slate-100 text-3xl"
                  >
                    −
                  </button>

                  <input
                    ref={quantityRef}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={quantity}
                    disabled={saving}
                    onChange={(event) =>
                      setQuantity(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void save();
                      }
                    }}
                    className="h-14 rounded-2xl border-2 border-blue-600 text-center text-3xl font-bold"
                  />

                  <button
                    type="button"
                    onClick={() => changeQuantity(1)}
                    disabled={saving}
                    className="rounded-2xl bg-blue-600 text-3xl text-white"
                  >
                    ＋
                  </button>
                </div>

                <p
                  className={`mt-5 rounded-2xl px-4 py-3 text-center text-lg font-bold ${
                    difference === 0
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  差異：{difference > 0 ? "+" : ""}
                  {difference}
                </p>

                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="mt-5 w-full rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white disabled:bg-slate-400"
                >
                  {saving ? "保存中…" : "棚卸を保存"}
                </button>
              </section>
            ) : (
              <section className="sticky top-5 rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
                <p className="text-lg font-bold">
                  商品を選んでください
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  商品カードまたはバーコード読み取りから入力できます。
                </p>
              </section>
            )}
          </aside>
        </div>
      </div>

      {singleCameraOpen && (
        <BarcodeCamera
          closeOnDetect
          onDetected={(barcode) => {
            setSingleCameraOpen(false);
            void scanBarcode(barcode, true);
          }}
          onClose={() => setSingleCameraOpen(false)}
        />
      )}

      {scannerOpen && (
        <BarcodeCamera
          onDetected={(barcode) => {
            void scanBarcode(barcode, true);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {confirmation && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/70 p-5">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-bold">
              {confirmation.title}
            </h2>

            <p className="mt-4 leading-7 text-slate-700">
              {confirmation.message}
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="flex-1 rounded-2xl bg-slate-200 py-3 font-bold"
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={() => void confirmAction()}
                className="flex-1 rounded-2xl bg-blue-600 py-3 font-bold text-white"
              >
                同意する
              </button>
            </div>
          </section>
        </div>
      )}

      {safetyStop && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/75 p-5">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-sm font-bold text-red-600">
              システム保護エラー
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              {safetyStop.title}
            </h2>

            <p className="mt-4 leading-7 text-slate-700">
              {safetyStop.message}
            </p>

            <p className="mt-5 rounded-xl bg-slate-100 p-3 text-sm font-bold">
              エラーコード：{safetyStop.code}
            </p>

            <p className="mt-5 text-sm text-slate-500">
              開始画面へ戻ります…
            </p>
          </section>
        </div>
      )}

      <UnregisteredItemDialog
        open={registerDialogOpen}
        sessionId={sessionId}
        initialJanCode={keyword}
        onClose={() => setRegisterDialogOpen(false)}
        onRegistered={registered}
      />

      {pendingCount > 0 && (
        <button
          type="button"
          onClick={() => void syncInstantRecords()}
          disabled={syncingInstantRecords}
          className="fixed bottom-5 right-5 z-40 rounded-full bg-amber-500 px-4 py-3 text-sm font-bold text-white shadow-lg"
        >
          {syncingInstantRecords
            ? "一時保存データを同期中…"
            : `一時保存データ ${pendingCount}件`}
        </button>
      )}

      <SystemErrorDialog
        open={Boolean(pendingSave)}
        code={pendingSave?.errorCode ?? ""}
        title="棚卸データを保存できませんでした"
        event="保存先との通信または保存処理で異常を検知しました。"
        message={
          pendingSave?.errorMessage ??
          "自動復旧できなかったため、再試行またはインスタント保存を選んでください。"
        }
        retrying={retryingSave}
        onRetry={() => void retryPendingSave()}
        onInstantSave={() => void savePendingInstantly()}
        onAdminAuthenticate={async (username, password) => {
          const response = await fetch("/api/admin/re-auth", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              username,
              password,
              errorReportId: pendingSave?.reportId,
              route: window.location.pathname,
              sessionId,
            }),
          });

          const data: unknown = await response.json();

          return {
            success:
              typeof data === "object" &&
              data !== null &&
              "success" in data &&
              data.success === true,
            message: getMessage(
              data,
              "管理者認証に失敗しました。"
            ),
          };
        }}
      />
    </main>
  );
}