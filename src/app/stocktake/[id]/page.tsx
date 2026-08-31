"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import BarcodeCamera from "@/components/stocktake/BarcodeCamera";
import CategoryQrScanner from "@/components/CategoryQrScanner";
import StocktakeInputPanel from "@/components/stocktake/StocktakeInputPanel";
import FeedbackToast from "@/components/common/FeedbackToast";
import UnregisteredItemDialog from "@/components/stocktake/UnregisteredItemDialog";
import StocktakeSystemErrorDialog from "@/components/stocktake/StocktakeSystemErrorDialog";
import { recoverAfterFailure } from "@/lib/client-error-recovery";
import { useInstantStocktake } from "@/hooks/useInstantStocktake";

type FilterType = "UNRECORDED" | "RECORDED" | "DIFFERENCE" | "ALL";
type SessionAction = "PAUSE" | "RESUME" | "COMPLETE";

type InventoryItem = {
  id: string;
  expectedQuantity: number;
  isRecorded: boolean;
  countedQuantity: number | null;
  difference: number | null;
  lotNo: string | null;
  expirationDate: string | null;
  unit: string | null;
  storageLocation: {
    id: string;
    name: string;
  } | null;
  item: {
    id: string;
    name: string;
    janCode: string | null;
    systemBarcode: string | null;
    managementCode: string | null;
    managementGroupCode?: string | null;
    manufacturer: string | null;
    majorCategory: string | null;
    minorCategory: string | null;
    defaultUnit: string | null;
  };
};

type ProgressData = {
  success: boolean;
  code?: string;
  message?: string;
  session: {
    id: string;
    title: string;
    operator: string | null;
    scopeLabel: string | null;
    status: "IN_PROGRESS" | "PAUSED" | "REVIEW" | "COMPLETED" | "CANCELLED";
    startedAt: string;
    pausedAt: string | null;
    completedAt: string | null;
    cancelledAt?: string | null;
  };
  permissions: {
    isOperator: boolean;
    isAdmin: boolean;
    canOperate: boolean;
    canManage: boolean;
    canRegisterItem: boolean;
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

type ConfirmState = {
  title: string;
  message: string;
  action: () => Promise<void>;
  confirmLabel: string;
  tone: "orange" | "blue" | "green";
} | null;

function readErrorMessage(value: unknown, fallback: string) {
  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }

  return fallback;
}

function readErrorCode(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "code" in value && typeof value.code === "string") {
    return value.code;
  }
  return fallback;
}

class StocktakeRequestError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

function statusLabel(status: ProgressData["session"]["status"]) {
  switch (status) {
    case "IN_PROGRESS":
      return "棚卸作業中";
    case "PAUSED":
      return "中断中";
    case "REVIEW":
      return "確認待ち";
    case "COMPLETED":
      return "完了";
    case "CANCELLED":
      return "取消";
    default:
      return status;
  }
}

export default function StocktakePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;

  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selected, setSelected] = useState<InventoryItem | null>(null);

  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<FilterType>("UNRECORDED");
  const [majorCategory, setMajorCategory] = useState<string | null>(null);

  const [countedQuantity, setCountedQuantity] = useState("");
  const [memo, setMemo] = useState("");
  const [selectedDetailsOpen, setSelectedDetailsOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  const [normalCameraOpen, setNormalCameraOpen] = useState(false);
  const [continuousCameraOpen, setContinuousCameraOpen] = useState(false);
  const [categoryQrOpen, setCategoryQrOpen] = useState(false);
  const [registerItemOpen, setRegisterItemOpen] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [systemError, setSystemError] = useState<{
    code: string;
    message: string;
    reportId: string | null;
    provisional: boolean;
    retry?: () => Promise<void>;
  } | null>(null);

  const initializedRef = useRef(false);
  const searchRequestRef = useRef(0);
  const barcodeBusyRef = useRef(false);
  const continuousQuantityRef = useRef<HTMLInputElement | null>(null);
  const hadPendingRecoveryRef = useRef(false);

  const canOperate =
    progress?.permissions.canOperate === true &&
    progress.session.status === "IN_PROGRESS";

  const isAdmin = progress?.permissions.isAdmin === true;
  const canManage = progress?.permissions.canManage === true;
  const canRegisterItem = progress?.permissions.canRegisterItem === true;
  const { pendingCount, syncing, saveInstant } = useInstantStocktake(sessionId);

  const submitStocktakeRecord = useCallback(
    async (inventoryInstanceId: string, quantity: number, recordMemo: string) => {
      const response = await fetch("/api/stocktake/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          inventoryInstanceId,
          countedQuantity: quantity,
          memo: recordMemo || null,
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new StocktakeRequestError(
          readErrorMessage(data, "棚卸入力を保存できませんでした。"),
          readErrorCode(data, `STOCKTAKE_RECORD_HTTP_${response.status}`)
        );
      }
      return data;
    },
    [sessionId]
  );

  const loadProgress = useCallback(async () => {
    const response = await fetch(
      `/api/stocktake/session/${sessionId}/progress`,
      {
        cache: "no-store",
      }
    );

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        readErrorMessage(data, "棚卸進捗を取得できませんでした。")
      );
    }

    setProgress(data as ProgressData);
  }, [sessionId]);

  const loadItems = useCallback(
    async (
      nextKeyword = "",
      nextFilter: FilterType = "UNRECORDED",
      nextMajorCategory: string | null = null
    ) => {
      const requestId = ++searchRequestRef.current;

      setSearching(true);

      try {
        const query = new URLSearchParams({
          sessionId,
          filter: nextFilter,
          q: nextKeyword,
        });

        if (nextMajorCategory) {
          query.set("majorCategory", nextMajorCategory);
        }

        const response = await fetch(
          `/api/inventory/search?${query.toString()}`,
          {
            cache: "no-store",
          }
        );

        const data: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            readErrorMessage(data, "棚卸対象の検索に失敗しました。")
          );
        }

        if (!Array.isArray(data)) {
          throw new Error("棚卸対象の形式が正しくありません。");
        }

        if (requestId === searchRequestRef.current) {
          setItems(data as InventoryItem[]);
        }
      } finally {
        if (requestId === searchRequestRef.current) {
          setSearching(false);
        }
      }
    },
    [sessionId]
  );

  useEffect(() => {
    if (pendingCount > 0) {
      hadPendingRecoveryRef.current = true;
      return;
    }

    if (hadPendingRecoveryRef.current) {
      hadPendingRecoveryRef.current = false;
      setSystemError(null);
      setMessage("管理者復旧を確認し、簡易保存した棚卸を正式登録しました。");
      void Promise.all([
        loadProgress(),
        loadItems("", filter, majorCategory),
      ]);
    }
  }, [filter, loadItems, loadProgress, majorCategory, pendingCount]);

  const refresh = useCallback(async () => {
    await Promise.all([
      loadProgress(),
      loadItems(keyword, filter, majorCategory),
    ]);
  }, [filter, keyword, loadItems, loadProgress, majorCategory]);

  useEffect(() => {
    // 複数端末の入力や在庫変更を定期反映する。入力中は数量を上書きしない。
    const sync = () => {
      if (document.visibilityState !== "visible" || selected || saving) return;
      void refresh().catch(() => {
        // 一時的な通信断では操作を止めず、次回同期で自動復旧する。
      });
    };
    const timer = window.setInterval(sync, 3_000);
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
    };
  }, [refresh, saving, selected]);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        setLoading(true);
        setError("");

        await Promise.all([
          loadProgress(),
          loadItems("", "UNRECORDED", null),
        ]);

        if (mounted) {
          initializedRef.current = true;
        }
      } catch (loadError) {
        if (mounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "棚卸情報を読み込めませんでした。"
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void initialize();

    return () => {
      mounted = false;
    };
  }, [loadItems, loadProgress]);

  useEffect(() => {
    if (!initializedRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadItems(keyword, filter, majorCategory).catch((searchError) => {
        setError(
          searchError instanceof Error
            ? searchError.message
            : "棚卸対象を検索できませんでした。"
        );
      });
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [filter, keyword, loadItems, majorCategory]);

  const categorySummary = useMemo(() => {
    const targetCount = items.length;
    const recordedCount = items.filter((item) => item.isRecorded).length;
    const differenceCount = items.filter(
      (item) => item.difference !== null && item.difference !== 0
    ).length;

    return {
      targetCount,
      recordedCount,
      unrecordedCount: Math.max(targetCount - recordedCount, 0),
      differenceCount,
    };
  }, [items]);

  const selectItem = useCallback((item: InventoryItem) => {
    setSelected(item);
    setCountedQuantity(
      String(item.countedQuantity ?? item.expectedQuantity)
    );
    setMemo("");
    setSelectedDetailsOpen(false);
    setMessage("");
    setError("");

    window.setTimeout(() => {
      document.getElementById("stocktake-quantity")?.focus();
      (
        document.getElementById("stocktake-quantity") as HTMLInputElement | null
      )?.select();
    }, 100);
  }, []);

  const requestBarcode = useCallback(async (barcode: string) => {
    const query = new URLSearchParams({ sessionId, q: barcode, filter: "ALL", exact: "true" });
    const response = await fetch(`/api/inventory/search?${query.toString()}`, { cache: "no-store" });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new StocktakeRequestError(readErrorMessage(data, "バーコード検索に失敗しました。"), readErrorCode(data, `STOCKTAKE_LOOKUP_HTTP_${response.status}`));
    }
    if (!Array.isArray(data)) throw new StocktakeRequestError("検索結果の形式が正しくありません。", "STOCKTAKE_LOOKUP_RESPONSE_INVALID");
    return data as InventoryItem[];
  }, [sessionId]);

  const findBarcode = useCallback(
    async (barcode: string) => {
      const trimmed = barcode.trim();

      if (!trimmed || barcodeBusyRef.current) {
        return;
      }

      barcodeBusyRef.current = true;
      setError("");
      setMessage(`読み取りました：${trimmed}`);

      try {
        const foundItems = await requestBarcode(trimmed);

        if (foundItems.length === 0) {
          setKeyword(trimmed);
          setFilter("ALL");
          setError(
            "最新の商品DBを再確認しましたが、この棚卸範囲には該当商品がありません。JAN・棚卸範囲を確認し、登録済みなら管理者へお問い合わせください。"
          );
          return;
        }

        if (foundItems.length === 1) {
          selectItem(foundItems[0]);
          return;
        }

        setItems(foundItems);
        setFilter("ALL");
        setKeyword(trimmed);
        setError(
          `${foundItems.length}件の商品が見つかりました。該当する商品を選択してください。`
        );
      } catch (lookupError) {
        const code = lookupError instanceof StocktakeRequestError ? lookupError.code : "STOCKTAKE_LOOKUP_NETWORK_ERROR";
        const detail = lookupError instanceof Error ? lookupError.message : "バーコード検索に失敗しました。";
        const recovery = await recoverAfterFailure({ code, title: "棚卸の商品検索エラー", message: detail, route: `/stocktake/${sessionId}`, sessionId, detail: { barcode: trimmed, operation: "REALTIME_LOOKUP" }, action: () => requestBarcode(trimmed) });
        if (recovery.success && recovery.value) {
          const recoveredItems = recovery.value;
          setMessage("自動復旧して最新の商品情報を取得しました。");
          setSystemError(null);
          if (recoveredItems.length === 1) selectItem(recoveredItems[0]);
          else if (recoveredItems.length > 1) { setItems(recoveredItems); setFilter("ALL"); setKeyword(trimmed); }
          else setError("自動復旧後も該当商品がありません。棚卸範囲を確認し、登録済みの場合は管理者へお問い合わせください。");
        } else {
          setSystemError({ code, message: `${detail} 管理者へ即時通知しました。管理者にお問い合わせください。`, reportId: recovery.reportId, provisional: false, retry: async () => {
            const retryItems = await requestBarcode(trimmed);
            if (retryItems.length === 1) selectItem(retryItems[0]);
            else { setItems(retryItems); setFilter("ALL"); setKeyword(trimmed); }
            setSystemError(null); setMessage("最新DBから商品情報を再取得しました。");
          } });
        }
      } finally {
        window.setTimeout(() => {
          barcodeBusyRef.current = false;
        }, 1000);
      }
    },
    [requestBarcode, selectItem, sessionId]
  );

  const saveRecord = async () => {
    if (!selected || !canOperate) {
      return;
    }

    const quantity = Number(countedQuantity);

    if (
      countedQuantity.trim() === "" ||
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      setError("棚卸数量には0以上の整数を入力してください。");
      return;
    }

    setSaving(true);
    setError("");

    const target = selected;
    const recordMemo = memo.trim();
    let formallySaved = false;

    try {
      await submitStocktakeRecord(target.id, quantity, recordMemo);
      formallySaved = true;
    } catch (saveError) {
      const code =
        saveError instanceof StocktakeRequestError
          ? saveError.code
          : "STOCKTAKE_RECORD_NETWORK_ERROR";
      const detail =
        saveError instanceof Error
          ? saveError.message
          : "棚卸入力を保存できませんでした。";

      const recovery = await recoverAfterFailure({
        code,
        title: "棚卸入力の保存エラー",
        message: detail,
        route: `/stocktake/${sessionId}`,
        sessionId,
        detail: { inventoryInstanceId: target.id },
        action: () => submitStocktakeRecord(target.id, quantity, recordMemo),
      });

      if (recovery.success) {
        formallySaved = true;
        setMessage("自動復旧して棚卸を正式に保存しました。");
      } else {
        try {
          await saveInstant({
            inventoryInstanceId: target.id,
            countedQuantity: quantity,
            memo: recordMemo || undefined,
            errorCode: code,
            errorReportId: recovery.reportId || undefined,
          });
          setSystemError({
            code,
            message: detail,
            reportId: recovery.reportId,
            provisional: true,
          });
          setMessage("簡易保存しました。次の商品を棚卸できます。");
        } catch {
          setSystemError({
            code: "STOCKTAKE_LOCAL_SAVE_FAILED",
            message: "正式保存と端末内の簡易保存の両方に失敗しました。この内容を控えて管理者へ連絡してください。",
            reportId: recovery.reportId,
            provisional: false,
          });
          return;
        }
      }
    }

    try {

      const difference = quantity - selected.expectedQuantity;

      if (formallySaved) {
        setMessage(
          difference === 0
            ? "一致で保存しました。次の商品を入力できます。"
            : `差異 ${difference > 0 ? "+" : ""}${difference} で保存しました。`
        );
      }

      setSelected(null);
      setCountedQuantity("");
      setMemo("");
      setKeyword("");

      if (formallySaved) {
        await Promise.all([
          loadProgress(),
          loadItems("", filter, majorCategory),
        ]);
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "棚卸入力を保存できませんでした。"
      );
    } finally {
      setSaving(false);
    }
  };

  const changeSessionStatus = async (action: SessionAction) => {
    setChangingStatus(true);
    setError("");

    try {
      const response = await fetch(`/api/stocktake/session/${sessionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          readErrorMessage(data, "棚卸状態を更新できませんでした。")
        );
      }

      if (action === "PAUSE") {
        setMessage("棚卸を中断しました。開始画面へ戻ります。");

        window.setTimeout(() => {
          router.push("/stocktake/start");
        }, 1300);

        return;
      }

      if (action === "RESUME") {
        setMessage("棚卸を再開しました。");
      }

      if (action === "COMPLETE") {
        router.push(`/stocktake/${sessionId}/result`);
        return;
      }

      await refresh();
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "棚卸状態を更新できませんでした。"
      );
    } finally {
      setChangingStatus(false);
    }
  };

  const handleCategoryDetected = useCallback((category: string) => {
    setCategoryQrOpen(false);
    setMajorCategory(category);
    setKeyword("");
    setFilter("UNRECORDED");
    setSelected(null);
    setCountedQuantity("");
    setMemo("");
    setMessage(`大分類「${category}」に絞り込みました。`);
    setError("");
  }, []);

  const difference =
    selected && countedQuantity.trim() !== ""
      ? Number(countedQuantity) - selected.expectedQuantity
      : null;

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-5 text-white sm:p-8">
        <div className="mx-auto max-w-6xl rounded-3xl bg-white p-8 text-slate-900">
          棚卸情報を読み込んでいます…
        </div>
      </main>
    );
  }

  if (!progress) {
    return (
      <main className="min-h-screen bg-slate-950 p-5 text-white sm:p-8">
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 text-slate-900">
          <h1 className="text-2xl font-bold">棚卸を開けませんでした</h1>
          <p className="mt-3 text-slate-600">
            {error || "棚卸情報を取得できませんでした。"}
          </p>
          <Link
            href="/stocktake/start"
            className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white"
          >
            棚卸開始へ戻る
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 pb-12 text-slate-950">
      <FeedbackToast
        message={error}
        tone="error"
        title="棚卸操作エラー"
        onClose={() => setError("")}
      />
      {pendingCount > 0 && (
        <div className="fixed bottom-4 left-4 z-[190] rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm font-black text-amber-950 shadow-xl">
          簡易保存 {pendingCount}件（{syncing ? "復旧確認中" : "管理者復旧待ち"}）
        </div>
      )}
      <FeedbackToast
        message={message}
        tone="success"
        onClose={() => setMessage("")}
        autoCloseMs={5000}
      />
      <header className="border-b border-slate-800 bg-slate-950 px-5 py-5 text-white sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-bold text-indigo-300">棚卸作業</p>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">
              {progress.session.title}
            </h1>
            <p className="mt-2 text-slate-300">
              対象：{progress.session.scopeLabel || "全在庫"}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              担当者：{progress.session.operator || "未設定"} ／ 状態：
              {statusLabel(progress.session.status)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => setCategoryQrOpen(true)}
              disabled={!canOperate}
              className="rounded-xl bg-violet-600 px-4 py-3 font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              大分類QR
            </button>

            <button
              type="button"
              onClick={() => setContinuousCameraOpen(true)}
              disabled={!canOperate}
              className="rounded-xl bg-slate-700 px-4 py-3 font-bold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              連続スキャン
            </button>

            {canRegisterItem && canOperate && (
              <button
                type="button"
                onClick={() => setRegisterItemOpen(true)}
                className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white transition hover:bg-emerald-500"
              >
                ＋ 商品登録
              </button>
            )}

            {canOperate && (
              <button
                type="button"
                onClick={() =>
                  setConfirm({
                    title: "棚卸を中断しますか？",
                    message:
                      "保存済みの棚卸入力は残ります。再開するまで入力・カメラ・検索操作は停止します。",
                    confirmLabel: "中断する",
                    tone: "orange",
                    action: () => changeSessionStatus("PAUSE"),
                  })
                }
                disabled={changingStatus}
                className="rounded-xl bg-orange-500 px-4 py-3 font-bold text-white transition hover:bg-orange-400 disabled:opacity-50"
              >
                中断
              </button>
            )}

            {progress.session.status === "PAUSED" &&
              (progress.permissions.isOperator || canManage) && (
                <button
                  type="button"
                  onClick={() =>
                    setConfirm({
                      title: "棚卸を再開しますか？",
                      message: "棚卸入力・検索・カメラ操作を再開します。",
                      confirmLabel: "再開する",
                      tone: "green",
                      action: () => changeSessionStatus("RESUME"),
                    })
                  }
                  disabled={changingStatus}
                  className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  再開
                </button>
              )}

            {(canOperate || canManage) &&
              progress.session.status === "IN_PROGRESS" && (
                <button
                  type="button"
                  onClick={() =>
                    setConfirm({
                      title: "棚卸を終了しますか？",
                      message:
                        "未棚卸の商品が残っていても終了できます。保存済みの棚卸結果を確認する画面へ進みます。",
                      confirmLabel: "終了して確認する",
                      tone: "blue",
                      action: () => changeSessionStatus("COMPLETE"),
                    })
                  }
                  disabled={changingStatus}
                  className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  終了
                </button>
              )}

            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-xl border border-slate-600 px-4 py-3 text-center font-bold text-white transition hover:bg-slate-800"
              >
                管理者メニュー
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
        {!canOperate && progress.session.status !== "COMPLETED" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
            <p className="font-bold">
              {progress.session.status === "PAUSED"
                ? "棚卸は中断中です"
                : "この棚卸は現在操作できません"}
            </p>
            <p className="mt-1 text-sm">
              再開されるまで、棚卸入力・バーコード読取・検索からの入力はできません。
            </p>
          </div>
        )}

        <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">棚卸進捗</p>
              <p className="mt-1 text-3xl font-black sm:text-4xl">
                {progress.summary.recordedCount}
                <span className="text-xl font-medium text-slate-500">
                  {" "}
                  / {progress.summary.targetCount} 件
                </span>
              </p>
            </div>
            <p className="text-3xl font-black text-indigo-600">
              {progress.summary.progressPercent}%
            </p>
          </div>

          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${progress.summary.progressPercent}%` }}
            />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-slate-100 p-3 text-center">
              <p className="text-sm text-slate-500">一致</p>
              <p className="mt-1 text-2xl font-black text-emerald-600">
                {progress.summary.matchedCount}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-3 text-center">
              <p className="text-sm text-slate-500">差異</p>
              <p className="mt-1 text-2xl font-black text-red-600">
                {progress.summary.differenceCount}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-3 text-center">
              <p className="text-sm text-slate-500">未棚卸</p>
              <p className="mt-1 text-2xl font-black text-orange-600">
                {progress.summary.unrecordedCount}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  disabled={!canOperate}
                  placeholder="JAN・商品名・メーカー・分類・保管場所で検索"
                  className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 px-4 py-4 text-lg outline-none transition focus:border-indigo-500 disabled:bg-slate-100"
                />

                <button
                  type="button"
                  disabled={!canOperate}
                  onClick={() => setNormalCameraOpen(true)}
                  className="rounded-2xl bg-indigo-600 px-5 py-4 text-xl font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="カメラでバーコードを読み取る"
                >
                  📷
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(
                  [
                    ["UNRECORDED", "未棚卸のみ"],
                    ["RECORDED", "棚卸済み"],
                    ["DIFFERENCE", "差異あり"],
                    ["ALL", "すべて"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={!canOperate}
                    onClick={() => setFilter(value)}
                    className={`rounded-full px-4 py-2 font-bold transition disabled:opacity-40 ${
                      filter === value
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {majorCategory && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-violet-50 px-4 py-3 text-violet-900">
                  <span className="font-bold">
                    大分類QRで絞り込み中：{majorCategory}
                  </span>
                  <span className="text-sm">
                    {categorySummary.recordedCount} /{" "}
                    {categorySummary.targetCount} 件 棚卸済み
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMajorCategory(null);
                      setMessage("大分類の絞り込みを解除しました。");
                    }}
                    className="ml-auto rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-violet-700 shadow-sm"
                  >
                    解除
                  </button>
                </div>
              )}
            </section>

            <section className="relative space-y-3" aria-busy={searching}>
              {searching && items.length > 0 && (
                <div
                  role="status"
                  className="sticky top-3 z-10 ml-auto w-fit rounded-full bg-slate-900/85 px-3 py-1.5 text-xs font-bold text-white shadow-sm backdrop-blur"
                >
                  最新情報へ更新中
                </div>
              )}

              {items.length === 0 ? (
                <div className="rounded-3xl bg-white p-8 text-center text-slate-500 shadow-sm">
                  {searching
                    ? "棚卸対象を検索しています…"
                    : "該当する棚卸対象がありません。"}
                </div>
              ) : (
                items.map((item) => {
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

                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!canOperate}
                      onClick={() => selectItem(item)}
                      className="block w-full rounded-3xl bg-white p-5 text-left shadow-sm transition hover:ring-2 hover:ring-indigo-400 disabled:cursor-default disabled:hover:ring-0 sm:p-6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="break-words text-xl font-black text-slate-950 sm:text-2xl">
                            {item.item.name}
                          </h2>
                          <p className="mt-2 text-sm text-slate-600">
                            JAN：{item.item.janCode || "-"}
                          </p>
                          {item.item.systemBarcode && (
                            <p className="mt-1 text-sm text-slate-600">
                              システムバーコード：{item.item.systemBarcode}
                            </p>
                          )}
                          <p className="mt-1 text-sm text-slate-600">
                            保管場所：{item.storageLocation?.name || "未設定"}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            分類：
                            {item.item.majorCategory || "-"}
                            {item.item.minorCategory
                              ? ` ／ ${item.item.minorCategory}`
                              : ""}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-black ${
                            status === "一致"
                              ? "bg-emerald-100 text-emerald-700"
                              : status === "差異あり"
                                ? "bg-red-100 text-red-700"
                                : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {status}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3 text-sm">
                        <span className="font-bold text-indigo-600">
                          現在庫：{item.expectedQuantity}
                          {item.unit ? ` ${item.unit}` : " 個"}
                        </span>
                        {item.isRecorded && (
                          <span className="font-bold text-slate-700">
                            棚卸：{item.countedQuantity}
                            {item.unit ? ` ${item.unit}` : " 個"}
                          </span>
                        )}
                        {itemDifference !== null && itemDifference !== 0 && (
                          <span className="font-bold text-red-600">
                            差異：{itemDifference > 0 ? "+" : ""}
                            {itemDifference}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </section>
          </div>

          <aside className="xl:sticky xl:top-5 xl:h-fit">
            <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-2xl font-black">棚卸入力</h2>

              {!selected ? (
                <div className="mt-5 rounded-2xl bg-slate-100 p-5 text-slate-600">
                  商品カードを選ぶか、バーコードを読み取ってください。
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  <div>
                    <p className="text-sm font-bold text-indigo-600">
                      選択中の商品
                    </p>
                    <h3 className="mt-1 text-xl font-black">
                      {selected.item.name}
                    </h3>
                    <p className="mt-2 text-slate-600">
                      現在庫：{selected.expectedQuantity}
                      {selected.unit ? ` ${selected.unit}` : " 個"}
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-expanded={selectedDetailsOpen}
                    onClick={() =>
                      setSelectedDetailsOpen((current) => !current)
                    }
                    className="w-full rounded-2xl bg-slate-100 px-4 py-3 font-black text-indigo-700 transition hover:bg-indigo-50"
                  >
                    {selectedDetailsOpen
                      ? "商品詳細を閉じる"
                      : "商品詳細を見る"}
                  </button>

                  {selectedDetailsOpen && (
                    <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                      <div><dt className="font-bold text-slate-500">JANコード</dt><dd className="mt-1 break-words font-semibold">{selected.item.janCode || "-"}</dd></div>
                      <div><dt className="font-bold text-slate-500">システムバーコード</dt><dd className="mt-1 break-words font-semibold">{selected.item.systemBarcode || "-"}</dd></div>
                      <div><dt className="font-bold text-slate-500">管理コード</dt><dd className="mt-1 break-words font-semibold">{selected.item.managementCode || "-"}</dd></div>
                      <div><dt className="font-bold text-slate-500">管理グループコード</dt><dd className="mt-1 break-words font-semibold">{selected.item.managementGroupCode || "-"}</dd></div>
                      <div><dt className="font-bold text-slate-500">メーカー</dt><dd className="mt-1 break-words font-semibold">{selected.item.manufacturer || "-"}</dd></div>
                      <div><dt className="font-bold text-slate-500">分類</dt><dd className="mt-1 break-words font-semibold">{[selected.item.majorCategory, selected.item.minorCategory].filter(Boolean).join(" / ") || "-"}</dd></div>
                      <div><dt className="font-bold text-slate-500">保管場所</dt><dd className="mt-1 break-words font-semibold">{selected.storageLocation?.name || "-"}</dd></div>
                      <div><dt className="font-bold text-slate-500">ロット番号</dt><dd className="mt-1 break-words font-semibold">{selected.lotNo || "-"}</dd></div>
                      <div><dt className="font-bold text-slate-500">使用期限</dt><dd className="mt-1 break-words font-semibold">{selected.expirationDate || "-"}</dd></div>
                    </dl>
                  )}

                  <div>
                    <label
                      htmlFor="stocktake-quantity"
                      className="block font-bold text-slate-800"
                    >
                      棚卸数量
                    </label>
                    <input
                      id="stocktake-quantity"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={countedQuantity}
                      onChange={(event) =>
                        setCountedQuantity(event.target.value)
                      }
                      disabled={!canOperate || saving}
                      className="mt-2 w-full rounded-2xl border-2 border-indigo-500 px-4 py-4 text-3xl font-black outline-none disabled:bg-slate-100"
                    />
                    <p className="mt-2 text-sm text-slate-500">
                      {selected.unit ? `単位：${selected.unit}` : "単位：個"}
                    </p>
                  </div>

                  {difference !== null && Number.isFinite(difference) && (
                    <div
                      className={`rounded-2xl px-4 py-4 font-black ${
                        difference === 0
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      差異：{difference > 0 ? "+" : ""}
                      {difference}
                      {selected.unit ? ` ${selected.unit}` : " 個"}
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="stocktake-memo"
                      className="block font-bold text-slate-800"
                    >
                      メモ
                    </label>
                    <textarea
                      id="stocktake-memo"
                      rows={3}
                      value={memo}
                      onChange={(event) => setMemo(event.target.value)}
                      disabled={!canOperate || saving}
                      placeholder="必要な場合のみ入力"
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 disabled:bg-slate-100"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(null);
                        setCountedQuantity("");
                        setMemo("");
                        setSelectedDetailsOpen(false);
                      }}
                      disabled={saving}
                      className="rounded-2xl bg-slate-100 px-4 py-4 font-black text-slate-700"
                    >
                      戻る
                    </button>

                    <button
                      type="button"
                      onClick={() => void saveRecord()}
                      disabled={!canOperate || saving}
                      className="rounded-2xl bg-indigo-600 px-4 py-4 font-black text-white transition hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {saving ? "保存中…" : "保存して次へ"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      {normalCameraOpen && (
        <BarcodeCamera
          title="バーコードを読み取る"
          notice="読み取ると自動でカメラを閉じ、棚卸入力へ進みます。"
          closeOnDetect
          onClose={() => setNormalCameraOpen(false)}
          onDetected={(barcode) => {
            setNormalCameraOpen(false);
            void findBarcode(barcode);
          }}
        />
      )}

      {continuousCameraOpen && (
        <BarcodeCamera
          title="連続スキャン中"
          notice="保存後、そのまま次の商品を読み取れます。終了するまでカメラは閉じません。"
          closeOnDetect={false}
          onClose={() => setContinuousCameraOpen(false)}
          onDetected={(barcode) => {
            if (selected || saving) {
              setError(
                "表示中の商品を保存するか「戻る」で解除してから、次の商品を読み取ってください。"
              );
              return;
            }
            void findBarcode(barcode);
          }}
        >
          <StocktakeInputPanel
            selected={selected}
            quantity={countedQuantity}
            saving={saving}
            disabled={!canOperate}
            inputRef={continuousQuantityRef}
            onQuantityChange={setCountedQuantity}
            onSave={() => void saveRecord()}
            onCancel={() => {
              setSelected(null);
              setCountedQuantity("");
              setMemo("");
              setError("");
            }}
            continuous
          />
        </BarcodeCamera>
      )}

      {systemError && (
        <StocktakeSystemErrorDialog
          code={systemError.code}
          message={systemError.message}
          reportId={systemError.reportId}
          provisional={systemError.provisional}
          isAdmin={isAdmin}
          onRetry={systemError.retry ?? refresh}
          onClose={() => setSystemError(null)}
        />
      )}

      <UnregisteredItemDialog
        open={registerItemOpen}
        sessionId={sessionId}
        initialJanCode={keyword}
        onClose={() => setRegisterItemOpen(false)}
        onRegistered={(target) => {
          setRegisterItemOpen(false);
          setKeyword("");
          setMessage(
            target.alreadyRegistered
              ? `「${target.item.name}」は登録済みです。既存の棚卸結果を表示します。`
              : `「${target.item.name}」を登録し、棚卸済みとして記録しました。`
          );
          void Promise.all([
            loadProgress(),
            loadItems("", filter, majorCategory),
          ]);
        }}
      />

      {categoryQrOpen && (
        <CategoryQrScanner
          onDetected={handleCategoryDetected}
          onClose={() => setCategoryQrOpen(false)}
        />
      )}

      {confirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-5">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-black">{confirm.title}</h2>
            <p className="mt-4 leading-7 text-slate-600">{confirm.message}</p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={changingStatus}
                className="rounded-2xl bg-slate-100 px-4 py-3 font-black text-slate-700"
              >
                キャンセル
              </button>

              <button
                type="button"
                disabled={changingStatus}
                onClick={async () => {
                  const action = confirm.action;
                  setConfirm(null);
                  await action();
                }}
                className={`rounded-2xl px-4 py-3 font-black text-white disabled:opacity-50 ${
                  confirm.tone === "orange"
                    ? "bg-orange-500"
                    : confirm.tone === "green"
                      ? "bg-emerald-600"
                      : "bg-indigo-600"
                }`}
              >
                {changingStatus ? "処理中…" : confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
