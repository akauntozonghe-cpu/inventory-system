"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BarcodeCamera from "@/components/stocktake/BarcodeCamera";
import CategoryQrScanner from "@/components/CategoryQrScanner";
import BarcodeCandidatePicker from "@/components/stocktake/BarcodeCandidatePicker";
import StocktakeInputPanel from "@/components/stocktake/StocktakeInputPanel";
import StocktakeSearchCard from "@/components/stocktake/StocktakeSearchCard";
import { saveStocktakeRecord } from "@/lib/stocktake-record-client";
import AdminModeDialog from "@/components/stocktake/AdminModeDialog";
import StocktakeAdminMenu from "@/components/stocktake/StocktakeAdminMenu";
import UnregisteredItemDialog from "@/components/stocktake/UnregisteredItemDialog";

type Filter = "ALL" | "UNRECORDED" | "RECORDED" | "DIFFERENCE";
type Action = "PAUSE" | "COMPLETE" | null;

type AdminUser = {
  id: string;
  username: string;
  displayName: string;
};

type Inventory = {
  id: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  isRecorded: boolean;
  lotNo: string | null;
  expirationDate: string | null;
  unit: string | null;
  item: {
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
    throw new Error(`サーバーから応答がありませんでした。HTTP ${response.status}`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`正しい応答を取得できませんでした。HTTP ${response.status}`);
  }
}

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
  const scanLockRef = useRef(false);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [items, setItems] = useState<Inventory[]>([]);
  const [selected, setSelected] = useState<Inventory | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<Filter>("UNRECORDED");
  const [majorCategory, setMajorCategory] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [singleCameraOpen, setSingleCameraOpen] = useState(false);
  const [continuousCameraOpen, setContinuousCameraOpen] = useState(false);
  const [categoryCameraOpen, setCategoryCameraOpen] = useState(false);

  const [candidates, setCandidates] = useState<Inventory[]>([]);
  const [scannedCode, setScannedCode] = useState("");
  const [confirmAction, setConfirmAction] = useState<Action>(null);

  const adminTapTimesRef = useRef<number[]>([]);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);

  const canEdit =
    progress?.session.status === "IN_PROGRESS" && !saving;

  const fetchProgress = useCallback(async () => {
    const response = await fetch(
      `/api/stocktake/session/${encodeURIComponent(sessionId)}/progress`,
      { cache: "no-store" }
    );

    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(getMessage(data, "棚卸進捗を取得できませんでした。"));
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
        throw new Error(getMessage(data, "棚卸対象を取得できませんでした。"));
      }

      setItems(data as Inventory[]);
    },
    [sessionId]
  );

  const reload = useCallback(
    async (
      nextKeyword = keyword,
      nextFilter = filter,
      nextMajorCategory = majorCategory
    ) => {
      setLoading(true);
      setErrorMessage("");

      try {
        await Promise.all([
          fetchProgress(),
          fetchItems(nextKeyword, nextFilter, nextMajorCategory),
        ]);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "棚卸データの読み込みに失敗しました。"
        );
      } finally {
        setLoading(false);
      }
    },
    [fetchItems, fetchProgress, filter, keyword, majorCategory]
  );

  useEffect(() => {
    void reload("", "UNRECORDED", null);
    // 初回だけ読み込む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload(keyword, filter, majorCategory);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [keyword, filter, majorCategory, reload]);

  const selectItem = useCallback((item: Inventory) => {
    setSelected(item);
    setQuantity(String(item.countedQuantity ?? item.expectedQuantity));
    setMessage("");
    setErrorMessage("");

    window.setTimeout(() => {
      quantityRef.current?.focus();
      quantityRef.current?.select();
    }, 50);
  }, []);

  const save = async () => {
    if (!selected || saving) {
      return;
    }

    const countedQuantity = Number(quantity);

    if (!Number.isInteger(countedQuantity) || countedQuantity < 0) {
      setErrorMessage("棚卸数量は0以上の整数で入力してください。");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await saveStocktakeRecord({
        sessionId,
        inventoryInstanceId: selected.id,
        countedQuantity,
      });

      setMessage("保存しました。");
      setScanMessage("保存しました。次の商品を読み取れます。");
      setSelected(null);
      setQuantity("");

      await reload(keyword, filter, majorCategory);

      window.setTimeout(() => {
        searchRef.current?.focus();
      }, 50);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "棚卸の保存に失敗しました。"
      );
    } finally {
      setSaving(false);
    }
  };

  const scanBarcode = async (barcode: string) => {
    const code = barcode.trim();

    if (!code || scanLockRef.current || !canEdit) {
      return;
    }

    scanLockRef.current = true;
    setScannedCode(code);
    setScanMessage(`読み取りました：${code}`);
    setErrorMessage("");

    try {
      const params = new URLSearchParams({
        sessionId,
        q: code,
        filter: "ALL",
      });

      const response = await fetch(
        `/api/inventory/search?${params.toString()}`,
        { cache: "no-store" }
      );

      const data = await readJson(response);

      if (!response.ok || !Array.isArray(data)) {
        throw new Error(getMessage(data, "バーコード検索に失敗しました。"));
      }

      const results = data as Inventory[];

      if (results.length === 0) {
        setErrorMessage(
          `「${code}」に該当する棚卸対象がありません。検索欄から商品名でも確認してください。`
        );
        return;
      }

      if (results.length === 1) {
        setItems(results);
        selectItem(results[0]);
        return;
      }

      setCandidates(results);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "バーコード検索に失敗しました。"
      );
    } finally {
      window.setTimeout(() => {
        scanLockRef.current = false;
      }, 900);
    }
  };

  const updateSession = async (action: "PAUSE" | "RESUME" | "COMPLETE") => {
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/stocktake/session/${encodeURIComponent(sessionId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(getMessage(data, "棚卸状態を更新できませんでした。"));
      }

      if (action === "PAUSE") {
        setMessage("棚卸を中断しました。開始画面へ戻ります。");
        window.setTimeout(() => router.push("/stocktake/start"), 1800);
        return;
      }

      if (action === "COMPLETE") {
        router.push(`/stocktake/${sessionId}/result`);
        return;
      }

      setMessage("棚卸を再開しました。");
      await reload(keyword, filter, majorCategory);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "棚卸状態を更新できませんでした。"
      );
    }
  };

  const applyMajorCategory = (category: string) => {
    const value = category.trim();

    if (!value || !canEdit) {
      return;
    }

    setMajorCategory(value);
    setKeyword("");
    setFilter("UNRECORDED");
    setSelected(null);
    setQuantity("");
    setCategoryCameraOpen(false);
    setMessage(`大分類「${value}」で棚卸対象を絞り込みました。`);
  };

  const handleTitleTap = () => {
    const now = Date.now();

    adminTapTimesRef.current = [
      ...adminTapTimesRef.current.filter((time) => now - time < 1200),
      now,
    ];

    if (adminTapTimesRef.current.length >= 3) {
      adminTapTimesRef.current = [];
      setAdminDialogOpen(true);
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-950 px-3 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-5 flex flex-col gap-4 text-white md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-blue-300">棚卸作業</p>

            <button
              type="button"
              onClick={handleTitleTap}
              className="mt-1 cursor-default select-none text-left"
              aria-label="棚卸タイトル"
            >
              <h1 className="break-words text-3xl font-black tracking-tight">
                {progress?.session.title ?? "棚卸"}
              </h1>
            </button>

            <p className="mt-2 text-sm text-slate-300">
              対象：{progress?.session.scopeLabel ?? "全在庫"}
            </p>

            {adminUser && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-violet-500/20 px-3 py-1 text-xs font-black text-violet-200">
                  管理者モード：{adminUser.displayName}
                </span>

                <button
                  type="button"
                  onClick={() => setAdminMenuOpen(true)}
                  className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white"
                >
                  管理者メニュー
                </button>
              </div>
            )}
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            {progress?.session.status === "IN_PROGRESS" && (
              <>
                {adminUser && (
                  <button
                    type="button"
                    onClick={() => setAdminMenuOpen(true)}
                    className="min-h-12 w-full rounded-xl bg-violet-600 px-3 py-3 text-sm font-bold text-white sm:w-auto"
                  >
                    管理者
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setCategoryCameraOpen(true)}
                  className="min-h-12 w-full rounded-xl bg-indigo-600 px-3 py-3 text-sm font-bold text-white sm:w-auto"
                >
                  大分類QR
                </button>

                <button
                  type="button"
                  onClick={() => setContinuousCameraOpen(true)}
                  className="min-h-12 w-full rounded-xl bg-slate-700 px-3 py-3 text-sm font-bold text-white sm:w-auto"
                >
                  連続スキャン
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmAction("PAUSE")}
                  className="min-h-12 w-full rounded-xl bg-orange-500 px-3 py-3 text-sm font-bold text-white sm:w-auto"
                >
                  中断
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmAction("COMPLETE")}
                  className="min-h-12 w-full rounded-xl bg-blue-600 px-3 py-3 text-sm font-bold text-white sm:w-auto"
                >
                  終了
                </button>
              </>
            )}

            {progress?.session.status === "PAUSED" && (
              <button
                type="button"
                onClick={() => void updateSession("RESUME")}
                className="min-h-12 w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white sm:w-auto"
              >
                再開する
              </button>
            )}
          </div>
        </header>

        {progress && (
          <section className="mb-5 rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">棚卸進捗</p>
                <p className="mt-1 text-3xl font-black sm:text-4xl">
                  {progress.summary.recordedCount}
                  <span className="mx-1 text-base font-medium text-slate-500 sm:text-lg">
                    /
                  </span>
                  <span className="text-lg font-semibold text-slate-600 sm:text-2xl">
                    {progress.summary.targetCount}件
                  </span>
                </p>
              </div>

              <p className="shrink-0 text-3xl font-black text-blue-600">
                {progress.summary.progressPercent}%
              </p>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${progress.summary.progressPercent}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
              <div className="rounded-2xl bg-slate-100 px-2 py-3 text-center">
                <p className="text-xs text-slate-500">一致</p>
                <p className="mt-1 text-2xl font-black text-emerald-600">
                  {progress.summary.matchedCount}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-100 px-2 py-3 text-center">
                <p className="text-xs text-slate-500">差異</p>
                <p className="mt-1 text-2xl font-black text-red-600">
                  {progress.summary.differenceCount}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-100 px-2 py-3 text-center">
                <p className="text-xs text-slate-500">未棚卸</p>
                <p className="mt-1 text-2xl font-black text-orange-600">
                  {progress.summary.unrecordedCount}
                </p>
              </div>
            </div>
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

        {errorMessage && (
          <section className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-800">
            {errorMessage}
          </section>
        )}

        {majorCategory && (
          <section className="mb-5 flex flex-col gap-3 rounded-3xl border border-indigo-200 bg-indigo-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="text-sm font-bold text-indigo-700">大分類ごとに棚卸中</p>
              <h2 className="mt-1 break-words text-xl font-black text-indigo-950">
                {majorCategory}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setMajorCategory(null)}
              className="min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-bold text-indigo-800 shadow-sm"
            >
              絞り込み解除
            </button>
          </section>
        )}

        {selected && (
          <section className="mb-5">
            <StocktakeInputPanel
              selected={selected}
              quantity={quantity}
              saving={saving}
              disabled={!canEdit}
              inputRef={quantityRef}
              onQuantityChange={setQuantity}
              onSave={() => void save()}
              onCancel={() => {
                setSelected(null);
                setQuantity("");
                searchRef.current?.focus();
              }}
            />
          </section>
        )}

        {progress?.session.status === "PAUSED" && (
          <section className="mb-5 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-black text-amber-900">棚卸は中断中です</h2>
            <p className="mt-1 text-sm leading-6 text-amber-800">
              再開するまで、検索・カメラ・棚卸入力は利用できません。
            </p>
          </section>
        )}

        <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              ref={searchRef}
              value={keyword}
              disabled={!canEdit}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="JAN・商品名・メーカー・分類・保管場所で検索"
              className="min-w-0 rounded-2xl border-2 border-slate-200 px-4 py-3 text-base outline-none focus:border-blue-500 disabled:bg-slate-100"
            />

            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setSingleCameraOpen(true)}
              className="flex min-h-14 items-center justify-center rounded-2xl bg-blue-600 px-0 text-xl text-white disabled:bg-slate-300 sm:px-4"
              aria-label="カメラでバーコードを読み取る"
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
                onClick={() => setFilter(value)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
                  filter === value
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700"
                } disabled:opacity-50`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5 space-y-4">
          {loading ? (
            <div className="rounded-3xl bg-white p-8 text-center text-slate-500 shadow-sm">
              棚卸対象を読み込んでいます…
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
              <p className="font-bold text-slate-700">
                該当する棚卸対象がありません。
              </p>
            </div>
          ) : (
            items.map((item) => (
              <StocktakeSearchCard
                key={item.id}
                item={item}
                expanded={expandedItemId === item.id}
                disabled={!canEdit}
                onToggle={() =>
                  setExpandedItemId((current) =>
                    current === item.id ? null : item.id
                  )
                }
                onSelect={() => selectItem(item)}
              />
            ))
          )}
        </section>
      </div>

      {singleCameraOpen && (
        <BarcodeCamera
          closeOnDetect
          notice={scanMessage}
          onDetected={(barcode) => void scanBarcode(barcode)}
          onClose={() => setSingleCameraOpen(false)}
        />
      )}

      {continuousCameraOpen && (
        <BarcodeCamera
          notice={scanMessage}
          onDetected={(barcode) => void scanBarcode(barcode)}
          onClose={() => {
            setContinuousCameraOpen(false);
            setSelected(null);
            setQuantity("");
            setScanMessage("");
          }}
        >
          <StocktakeInputPanel
            selected={selected}
            quantity={quantity}
            saving={saving}
            disabled={!canEdit}
            inputRef={quantityRef}
            onQuantityChange={setQuantity}
            onSave={() => void save()}
            onCancel={() => {
              setSelected(null);
              setQuantity("");
            }}
            continuous
          />
        </BarcodeCamera>
      )}

      {categoryCameraOpen && (
        <CategoryQrScanner
          currentCategory={majorCategory}
          onDetected={applyMajorCategory}
          onClose={() => setCategoryCameraOpen(false)}
        />
      )}

      {candidates.length > 0 && (
        <BarcodeCandidatePicker
          barcode={scannedCode}
          candidates={candidates}
          onClose={() => setCandidates([])}
          onSelect={(candidate) => {
            const item = candidate as Inventory;
            setCandidates([]);
            setItems([item]);
            selectItem(item);
          }}
        />
      )}

      <AdminModeDialog
        open={adminDialogOpen}
        sessionId={sessionId}
        onClose={() => setAdminDialogOpen(false)}
        onAuthenticated={(admin) => {
          setAdminUser(admin);
          setAdminDialogOpen(false);
          setMessage(`管理者モードを開始しました：${admin.displayName}`);
        }}
      />

      <StocktakeAdminMenu
        open={adminMenuOpen}
        adminName={adminUser?.displayName ?? ""}
        onClose={() => setAdminMenuOpen(false)}
        onRegisterItem={() => {
          setAdminMenuOpen(false);
          setRegisterDialogOpen(true);
        }}
        onIssueBarcode={() => {
          setAdminMenuOpen(false);
          router.push("/items");
        }}
        onOpenErrorReports={() => {
          setAdminMenuOpen(false);
          router.push("/admin/error-reports");
        }}
        onReload={() => {
          setAdminMenuOpen(false);
          void reload(keyword, filter, majorCategory);
          setMessage("棚卸対象を再読み込みしました。");
        }}
        onExitAdminMode={() => {
          setAdminMenuOpen(false);
          setAdminUser(null);
          setMessage("管理者モードを終了しました。");
        }}
      />

      <UnregisteredItemDialog
        open={registerDialogOpen}
        sessionId={sessionId}
        initialJanCode={scannedCode || keyword}
        onClose={() => setRegisterDialogOpen(false)}
        onRegistered={() => {
          setRegisterDialogOpen(false);
          setMessage("商品を登録し、今回の棚卸対象へ追加しました。");
          setKeyword("");
          setFilter("UNRECORDED");
          void reload("", "UNRECORDED", majorCategory);
        }}
      />

      {confirmAction && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/70 p-4">
          <section className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <h2 className="text-xl font-black text-slate-950">
              {confirmAction === "PAUSE"
                ? "棚卸を中断しますか？"
                : "棚卸を終了しますか？"}
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              {confirmAction === "PAUSE"
                ? "保存済みの棚卸データは残ります。あとで開始画面から再開できます。"
                : "結果を確認する画面へ進みます。結果画面で確定するまで、在庫へは正式反映されません。"}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="min-h-12 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700"
              >
                やめる
              </button>

              <button
                type="button"
                onClick={() => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  void updateSession(action === "PAUSE" ? "PAUSE" : "COMPLETE");
                }}
                className={`min-h-12 rounded-xl px-4 py-3 font-black text-white ${
                  confirmAction === "PAUSE"
                    ? "bg-orange-500"
                    : "bg-blue-600"
                }`}
              >
                はい
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}