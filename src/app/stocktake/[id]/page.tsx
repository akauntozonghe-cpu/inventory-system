"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BarcodeCamera from "@/components/stocktake/BarcodeCamera";
import UnregisteredItemDialog from "@/components/stocktake/UnregisteredItemDialog";
import { saveStocktakeRecord } from "@/lib/stocktake-record-client";

type Filter = "ALL" | "UNRECORDED" | "RECORDED" | "DIFFERENCE";

type Inventory = {
  id: string;
  expectedQuantity: number;
  isRecorded: boolean;
  countedQuantity: number | null;
  item: {
    id?: string;
    name: string;
    janCode: string | null;
    systemBarcode?: string | null;
    managementCode: string | null;
  };
  storageLocation: {
    id?: string;
    name: string;
  } | null;
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

type ConfirmAction = "PAUSE" | "COMPLETE" | null;

type SystemError = {
  code: string;
  title: string;
  message: string;
} | null;

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

function getCode(data: unknown, fallback: string) {
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
  const pausingRef = useRef(false);
  const scanningRef = useRef(false);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [items, setItems] = useState<Inventory[]>([]);
  const [selected, setSelected] = useState<Inventory | null>(null);

  const [filter, setFilter] = useState<Filter>("UNRECORDED");
  const [keyword, setKeyword] = useState("");
  const [quantity, setQuantity] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [singleCameraOpen, setSingleCameraOpen] = useState(false);
  const [continuousCameraOpen, setContinuousCameraOpen] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);

  const [message, setMessage] = useState("");
  const [systemError, setSystemError] = useState<SystemError>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const canEdit =
    progress?.session.status === "IN_PROGRESS" &&
    !systemError &&
    !saving;

  const fetchProgress = useCallback(async () => {
    const response = await fetch(
      `/api/stocktake/session/${encodeURIComponent(sessionId)}/progress`,
      { cache: "no-store" }
    );

    const data: unknown = await response.json();

    if (!response.ok) {
      throw new Error(getMessage(data, "進捗を取得できませんでした。"));
    }

    setProgress(data as Progress);
  }, [sessionId]);

  const fetchItems = useCallback(
    async (
      nextKeyword = "",
      nextFilter: Filter = "UNRECORDED"
    ): Promise<Inventory[]> => {
      const response = await fetch(
        `/api/inventory/search?sessionId=${encodeURIComponent(
          sessionId
        )}&q=${encodeURIComponent(nextKeyword)}&filter=${nextFilter}`,
        { cache: "no-store" }
      );

      const data: unknown = await response.json();

      if (!response.ok) {
        const error = new Error(
          getMessage(data, "在庫検索に失敗しました。")
        ) as Error & { code?: string };

        error.code = getCode(data, "INVENTORY_SEARCH_500");
        throw error;
      }

      if (!Array.isArray(data)) {
        const error = new Error(
          "在庫検索の形式が正しくありません。"
        ) as Error & { code?: string };

        error.code = "INVENTORY_SEARCH_INVALID_RESPONSE";
        throw error;
      }

      return data as Inventory[];
    },
    [sessionId]
  );

  const reload = useCallback(
    async (
      nextKeyword = "",
      nextFilter: Filter = filter,
      showLoading = true
    ) => {
      if (showLoading) {
        setLoading(true);
      }

      try {
        const [nextItems] = await Promise.all([
          fetchItems(nextKeyword, nextFilter),
          fetchProgress(),
        ]);

        setItems(nextItems);
        setSystemError(null);

        return nextItems;
      } catch (error) {
        const code =
          error instanceof Error &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : "STOCKTAKE_LOAD_500";

        setSystemError({
          code,
          title: "棚卸データを読み込めませんでした",
          message:
            error instanceof Error
              ? error.message
              : "通信状態を確認して、再試行してください。",
        });

        return [];
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [fetchItems, fetchProgress, filter]
  );

  const updateSessionStatus = useCallback(
    async (action: "PAUSE" | "RESUME") => {
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

      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getMessage(data, "棚卸状態を変更できませんでした。")
        );
      }
    },
    [sessionId]
  );

  const pauseForSafety = useCallback(
    async (code: string, title: string, detail: string) => {
      if (pausingRef.current) {
        return;
      }

      pausingRef.current = true;

      setSingleCameraOpen(false);
      setContinuousCameraOpen(false);
      setRegisterDialogOpen(false);
      setSelected(null);
      setQuantity("");

      try {
        await updateSessionStatus("PAUSE");
      } catch {
        // 通信不能でも画面操作は停止する
      }

      setSystemError({
        code,
        title,
        message: detail,
      });
    },
    [updateSessionStatus]
  );

  const selectItem = useCallback(
    (item: Inventory) => {
      if (!canEdit) {
        setMessage("棚卸を再開してから入力してください。");
        return;
      }

      setSelected(item);
      setQuantity(String(item.countedQuantity ?? item.expectedQuantity));
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
      const difference = countedQuantity - item.expectedQuantity;

      setSelected(null);
      setQuantity("");
      setKeyword("");

      setMessage(
        difference === 0
          ? "保存しました。次の商品を読み取れます。"
          : `差異を保存しました（${difference > 0 ? "+" : ""}${difference}）。`
      );

      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                isRecorded: true,
                countedQuantity,
              }
            : currentItem
        )
      );

      void fetchProgress();

      requestAnimationFrame(() => {
        if (!continuousCameraOpen) {
          searchRef.current?.focus();
        }
      });
    },
    [continuousCameraOpen, fetchProgress]
  );

  const save = useCallback(async () => {
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
    setMessage("");

    try {
      await saveStocktakeRecord({
        sessionId,
        inventoryInstanceId: selected.id,
        countedQuantity,
      });

      finishSaveUi(selected, countedQuantity);
    } catch (error) {
      setSystemError({
        code: "STOCKTAKE_SAVE_001",
        title: "棚卸データを保存できませんでした",
        message:
          error instanceof Error
            ? error.message
            : "通信状態を確認して、再試行してください。",
      });
    } finally {
      setSaving(false);
    }
  }, [
    canEdit,
    finishSaveUi,
    quantity,
    selected,
    sessionId,
  ]);

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
        const normalized = normalizeCode(value);

        const exact = results.filter((item) =>
          [
            item.item.janCode,
            item.item.systemBarcode,
            item.item.managementCode,
          ].some((code) => normalizeCode(code) === normalized)
        );

        const target =
          exact.length === 1
            ? exact[0]
            : results.length === 1
              ? results[0]
              : null;

        if (!target) {
          if (results.length === 0) {
            setMessage(
              "該当商品がありません。未登録商品として登録できます。"
            );
            setRegisterDialogOpen(true);
            return;
          }

          setMessage(
            `${results.length}件見つかりました。商品を選択してください。`
          );
          setItems(results);
          return;
        }

        setItems([target]);
        setMessage(`読み取りました：${value}`);

        if (autoSelect) {
          selectItem(target);
        }
      } catch (error) {
        setSystemError({
          code:
            error instanceof Error &&
            "code" in error &&
            typeof error.code === "string"
              ? error.code
              : "INVENTORY_SEARCH_500",
          title: "在庫検索に失敗しました",
          message:
            error instanceof Error
              ? error.message
              : "通信状態を確認して、再試行してください。",
        });
      } finally {
        window.setTimeout(() => {
          scanningRef.current = false;
        }, 800);
      }
    },
    [canEdit, fetchItems, selected, selectItem]
  );

  const handleManualSearch = useCallback(async () => {
    const value = keyword.trim();

    if (!value) {
      await reload("", filter);
      return;
    }

    await scanBarcode(value, false);
  }, [filter, keyword, reload, scanBarcode]);

  const changeQuantity = (amount: number) => {
    const current = Number(quantity || 0);
    setQuantity(String(Math.max(0, current + amount)));
    quantityRef.current?.focus();
  };

  const handleRegistered = (target: RegisteredTarget) => {
    const registeredItem: Inventory = {
      id: target.id,
      expectedQuantity: target.expectedQuantity,
      isRecorded: target.isRecorded,
      countedQuantity: target.countedQuantity,
      item: target.item,
      storageLocation: target.storageLocation,
    };

    setRegisterDialogOpen(false);
    setSystemError(null);
    setFilter("ALL");
    setKeyword("");
    setItems([registeredItem]);
    setMessage(
      "商品を登録し、今回の棚卸対象へ追加しました。数量を確認して保存してください。"
    );

    void fetchProgress();
    selectItem(registeredItem);
  };

  const doPause = async () => {
    try {
      await updateSessionStatus("PAUSE");
      setConfirmAction(null);
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
            : "通信状態を確認して、再試行してください。",
      });
    }
  };

  const resume = async () => {
    try {
      await updateSessionStatus("RESUME");
      pausingRef.current = false;
      setSystemError(null);
      setMessage("棚卸を再開しました。");
      await reload("", filter);
    } catch (error) {
      setSystemError({
        code: "STOCKTAKE_RESUME_500",
        title: "棚卸を再開できませんでした",
        message:
          error instanceof Error
            ? error.message
            : "通信状態を確認して、再試行してください。",
      });
    }
  };

  const confirm = async () => {
    if (confirmAction === "PAUSE") {
      await doPause();
      return;
    }

    if (confirmAction === "COMPLETE") {
      setConfirmAction(null);
      router.push(`/stocktake/${sessionId}/result`);
    }
  };

  useEffect(() => {
    void reload("", "UNRECORDED");
  }, [reload]);

  useEffect(() => {
    if (!progress?.session.status) {
      return;
    }

    if (progress.session.status === "PAUSED") {
      setSingleCameraOpen(false);
      setContinuousCameraOpen(false);
      setSelected(null);
      setQuantity("");
    }
  }, [progress?.session.status]);

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "input",
    ];

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };

    events.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, {
        passive: true,
      });
    });

    const idleTimer = window.setInterval(() => {
      const idleMilliseconds = Date.now() - lastActivityRef.current;

      if (idleMilliseconds >= 30 * 60 * 1000) {
        void pauseForSafety(
          "STOCKTAKE_IDLE_30MIN",
          "操作がないため棚卸を中断しました",
          "30分間操作がなかったため、データ保護のため棚卸を中断しました。開始画面から再開してください。"
        );
      }
    }, 15000);

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });

      window.clearInterval(idleTimer);
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
      void pauseForSafety(
        "STOCKTAKE_BROWSER_BACK",
        "ブラウザの戻る操作を検知しました",
        "データ保護のため棚卸を中断しました。開始画面から再開してください。"
      );
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [canEdit, pauseForSafety, sessionId]);

  const difference =
    selected && Number.isFinite(Number(quantity))
      ? Number(quantity) - selected.expectedQuantity
      : 0;

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="text-white">
            <h1 className="text-3xl font-bold">
              {progress?.session.title ?? "棚卸"}
            </h1>
            <p className="mt-1 text-slate-300">
              対象：{progress?.session.scopeLabel ?? "全在庫"}
            </p>
            <p className="mt-1 text-slate-300">
              状態：
              {progress?.session.status === "PAUSED"
                ? "中断中"
                : progress?.session.status === "COMPLETED"
                  ? "完了"
                  : "棚卸中"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {progress?.session.status === "IN_PROGRESS" && (
              <>
                <button
                  type="button"
                  onClick={() => setContinuousCameraOpen(true)}
                  className="rounded-2xl bg-slate-700 px-4 py-3 font-bold text-white"
                >
                  連続スキャン
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmAction("PAUSE")}
                  className="rounded-2xl bg-orange-500 px-4 py-3 font-bold text-white"
                >
                  中断
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmAction("COMPLETE")}
                  className="rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white"
                >
                  終了
                </button>
              </>
            )}

            {progress?.session.status === "PAUSED" && (
              <button
                type="button"
                onClick={() => void resume()}
                className="rounded-2xl bg-emerald-600 px-4 py-3 font-bold text-white"
              >
                再開する
              </button>
            )}
          </div>
        </header>

        {progress && (
          <section className="mb-5 rounded-3xl bg-white p-5 shadow-sm">
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

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{
                  width: `${progress.summary.progressPercent}%`,
                }}
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-slate-100 p-3">
                <p className="text-xs text-slate-500">一致</p>
                <p className="text-xl font-bold text-emerald-600">
                  {progress.summary.matchedCount}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-100 p-3">
                <p className="text-xs text-slate-500">差異</p>
                <p className="text-xl font-bold text-red-600">
                  {progress.summary.differenceCount}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-100 p-3">
                <p className="text-xs text-slate-500">未棚卸</p>
                <p className="text-xl font-bold text-orange-600">
                  {progress.summary.unrecordedCount}
                </p>
              </div>
            </div>
          </section>
        )}

        {message && (
          <div className="mb-4 rounded-2xl bg-blue-100 px-4 py-3 text-blue-900">
            {message}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_430px]">
          <section>
            <div className="rounded-3xl bg-white p-4 shadow-sm">
              <div className="flex gap-2">
                <input
                  ref={searchRef}
                  value={keyword}
                  disabled={!canEdit}
                  onChange={(event) => setKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleManualSearch();
                    }
                  }}
                  placeholder="JAN・システムバーコード・商品名で検索"
                  className="min-w-0 flex-1 rounded-2xl border-2 border-slate-300 px-4 py-3 outline-none focus:border-blue-600 disabled:bg-slate-100"
                />

                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setSingleCameraOpen(true)}
                  className="rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white disabled:bg-slate-400"
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
                      void reload("", value);
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
              {loading ? (
                <div className="rounded-3xl bg-white p-7 text-center text-slate-500 shadow-sm">
                  データを読み込み中です…
                </div>
              ) : items.length === 0 ? (
                <div className="rounded-3xl bg-white p-7 text-center shadow-sm">
                  <p className="text-slate-600">
                    該当する棚卸対象がありません。
                  </p>

                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setRegisterDialogOpen(true)}
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
                      : item.countedQuantity - item.expectedQuantity;

                  const label = !item.isRecorded
                    ? "未棚卸"
                    : itemDifference === 0
                      ? "一致"
                      : `差異 ${
                          itemDifference !== null && itemDifference > 0
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
                      className="w-full rounded-3xl bg-white p-5 text-left shadow-sm transition hover:ring-2 hover:ring-blue-400 disabled:opacity-60"
                    >
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-lg font-bold">
                            {item.item.name}
                          </h2>

                          <p className="mt-2 text-sm text-slate-600">
                            JAN：{item.item.janCode ?? "-"}
                          </p>

                          {item.item.systemBarcode && (
                            <p className="text-sm text-slate-600">
                              システムバーコード：
                              {item.item.systemBarcode}
                            </p>
                          )}

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
              <section className="sticky top-5 rounded-3xl bg-white p-5 shadow-sm">
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
                    disabled={saving}
                    onClick={() => {
                      setSelected(null);
                      setQuantity("");
                      searchRef.current?.focus();
                    }}
                    className="h-fit rounded-xl bg-slate-100 px-3 py-2 font-bold"
                  >
                    戻る
                  </button>
                </div>

                <label className="mt-5 block text-sm font-bold">
                  棚卸数量
                </label>

                <div className="mt-2 grid grid-cols-[60px_minmax(0,1fr)_60px] gap-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => changeQuantity(-1)}
                    className="rounded-2xl bg-slate-100 text-3xl font-bold"
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
                    onChange={(event) => setQuantity(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void save();
                      }
                    }}
                    className="h-14 rounded-2xl border-2 border-blue-600 text-center text-3xl font-bold outline-none"
                  />

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => changeQuantity(1)}
                    className="rounded-2xl bg-blue-600 text-3xl font-bold text-white"
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
                  disabled={saving}
                  onClick={() => void save()}
                  className="mt-5 w-full rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white disabled:bg-slate-400"
                >
                  {saving ? "保存中…" : "棚卸を保存"}
                </button>
              </section>
            ) : (
              <section className="sticky top-5 rounded-3xl bg-white p-7 text-center shadow-sm">
                <p className="text-lg font-bold">
                  商品を選んでください
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  商品カードを選ぶか、バーコードを読み取ると入力できます。
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

      {continuousCameraOpen && (
        <BarcodeCamera
          onDetected={(barcode) => {
            void scanBarcode(barcode, true);
          }}
          onClose={() => setContinuousCameraOpen(false)}
        />
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/70 p-5">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-bold">
              {confirmAction === "PAUSE"
                ? "棚卸を中断しますか？"
                : "棚卸を終了しますか？"}
            </h2>

            <p className="mt-4 leading-7 text-slate-700">
              {confirmAction === "PAUSE"
                ? "保存済みのデータは残ります。開始画面から再開できます。"
                : "結果を確認した後、確定して棚卸を完了できます。"}
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="flex-1 rounded-2xl bg-slate-200 py-3 font-bold"
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={() => void confirm()}
                className="flex-1 rounded-2xl bg-blue-600 py-3 font-bold text-white"
              >
                同意する
              </button>
            </div>
          </section>
        </div>
      )}

      {systemError && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/75 p-5">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-sm font-bold text-red-600">
              システムエラー
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              {systemError.title}
            </h2>

            <p className="mt-4 leading-7 text-slate-700">
              {systemError.message}
            </p>

            <p className="mt-5 rounded-xl bg-slate-100 p-3 text-sm font-bold">
              エラーコード：{systemError.code}
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => router.replace("/stocktake/start")}
                className="flex-1 rounded-2xl bg-slate-200 py-3 font-bold"
              >
                開始画面へ戻る
              </button>

              <button
                type="button"
                onClick={() => {
                  pausingRef.current = false;
                  setSystemError(null);
                  void reload(keyword, filter);
                }}
                className="flex-1 rounded-2xl bg-blue-600 py-3 font-bold text-white"
              >
                再試行
              </button>
            </div>
          </section>
        </div>
      )}

      <UnregisteredItemDialog
        open={registerDialogOpen}
        sessionId={sessionId}
        initialJanCode={keyword}
        onClose={() => setRegisterDialogOpen(false)}
        onRegistered={handleRegistered}
      />
    </main>
  );
}