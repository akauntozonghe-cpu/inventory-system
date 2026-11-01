"use client";
import ImeInput from "@/components/common/ImeInput";

import { requestBack } from "@/lib/navigation-history";
import InventoryLifecycle from "@/components/inventory/InventoryLifecycle";
import Modal from "@/components/common/Modal";
import ProductCodeField from "@/components/ProductCodeField";
import InventoryStatusBadges from "@/components/inventory/InventoryStatusBadges";
import { useAppAccess } from "@/components/auth/AppAccessProvider";
import ProductPhotos from "@/components/inventory/ProductPhotos";
import ProductIdentity from "@/components/inventory/ProductIdentity";
import StockStateSummary from "@/components/inventory/StockStateSummary";
import type {StockListing} from "@/lib/stock-state";
import { useAdminMode } from "@/components/auth/PageAdminMode";
import { fetchFresh } from "@/lib/fetch-fresh";

import Link from "@/components/auth/PermissionLink";
import { expiryPolicy, expiryPolicyLabels } from "@/lib/expiry-policy";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
const SystemBarcodeLabel=dynamic(()=>import("@/components/SystemBarcodeLabel"),{ssr:false});
import FeedbackToast from "@/components/common/FeedbackToast";

import SelectOrCreate from "@/components/SelectOrCreate";
import { useRegistrationOptions } from "@/hooks/useRegistrationOptions";
import { displayUnit } from "@/lib/unit";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";


type StorageLocation = {
  id: string;
  name: string;
};

type InventoryInstance = {
  id: string;
  quantity: number;
  actualQuantity: number | null;
  marketplaceListings?: StockListing[];
  manufacturer: string | null;
  majorCategory: string | null;
  minorCategory: string | null;
  lotNo: string | null;
  expirationDate: string | null;
  expirationManagementStatus: string;
  inspectionExcluded?: boolean | null;
  expirationAlertDays?: number;
  createdAt?: string;
  unit: string | null;
  allocationType: "home" | "flea_market" | "warehouse";
  status: string;
  stocktakeStatus: string;
  updatedAt: string;
  storageLocationId: string | null;
  storageLocation: StorageLocation | null;
};

type Item = {
  updatedAt?: string;
  createdAt?: string;
  isArchived?: boolean;
  inspectionExcluded?: boolean;
  id: string;
  name: string;
  janCode: string | null;
  systemBarcode: string | null;
  manufacturer: string | null;
  majorCategory: string | null;
  minorCategory: string | null;
  defaultUnit: string | null;
  inventoryInstances: InventoryInstance[];
};

type ItemForm = {
  generateSystemBarcode?: boolean;
  expectedUpdatedAt?: string;
  name: string;
  janCode: string;
  systemBarcode: string;
  manufacturer: string;
  majorCategory: string;
  minorCategory: string;
  defaultUnit: string;
  reason: string;
};

type InventoryForm = {
  storageLocationId: string;
  manufacturer: string;
  majorCategory: string;
  minorCategory: string;
  lotNo: string;
  expirationDate: string;
  expirationNotApplicable: boolean;
  unit: string;
  quantity: string;
  actualQuantity: string;
  allocationType: "home" | "flea_market" | "warehouse";
  status: string;
  stocktakeStatus: string;
  reason: string;
  memo: string;
};

function text(value: string | null | undefined) {
  return value?.trim() || "-";
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-");
    return `${year}年${Number(month)}月`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
  }).format(date);
}

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
  const body = await response.text();

  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(
      "システムからの応答を読み取れませんでした。ページを再読み込みしてから、もう一度お試しください。"
    );
  }
}

function isItem(value: unknown): value is Omit<Item, "inventoryInstances"> & {
  inventoryInstances?: unknown;
} {
  return (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

function normalizeItem(data: unknown): Item {
  if (!data || typeof data !== "object") {
    throw new Error("商品情報の形式が正しくありません。");
  }

  const payload = data as Record<string, unknown>;
  const candidate = "item" in payload ? payload.item : payload;

  if (!isItem(candidate)) {
    throw new Error("商品情報の形式が正しくありません。");
  }

  return {
    ...candidate,
    inventoryInstances: Array.isArray(candidate.inventoryInstances)
      ? (candidate.inventoryInstances as InventoryInstance[])
      : [],
  };
}


function itemToForm(item: Item): ItemForm {
  return {
    expectedUpdatedAt: item.updatedAt,
    name: item.name,
    janCode: item.janCode ?? "",
    systemBarcode: item.systemBarcode ?? "",
    manufacturer: item.manufacturer ?? "",
    majorCategory: item.majorCategory ?? "",
    minorCategory: item.minorCategory ?? "",
    defaultUnit: item.defaultUnit ?? "",
    reason: "",
  };
}

function inventoryToForm(inventory: InventoryInstance): InventoryForm {
  return {
    storageLocationId: inventory.storageLocationId ?? "",
    manufacturer: inventory.manufacturer ?? "",
    majorCategory: inventory.majorCategory ?? "",
    minorCategory: inventory.minorCategory ?? "",
    lotNo: inventory.lotNo ?? "",
    expirationDate: inventory.expirationDate ?? "",
    expirationNotApplicable: !inventory.expirationDate && inventory.expirationManagementStatus === "NO_EXPIRY",
    unit: inventory.unit ?? "",
    quantity: String(inventory.quantity),
    actualQuantity:
      inventory.actualQuantity === null
        ? ""
        : String(inventory.actualQuantity),
    allocationType: inventory.allocationType,
    status: inventory.status,
    stocktakeStatus: inventory.stocktakeStatus,
    reason: "",
    memo: "",
  };
}

function allocationLabel(value: InventoryInstance["allocationType"]) {
  if (value === "warehouse") {
    return "倉庫";
  }

  if (value === "flea_market") {
    return "フリーマーケット";
  }

  return "自宅";
}

export default function ItemDetailPage() {
  const params = useParams();
  const searchParams=useSearchParams();
  const [focusedInventory,setFocusedInventory]=useState("");
  useEffect(()=>{setFocusedInventory(searchParams.get("inventoryId")??"");},[searchParams]);

  const itemId = typeof params.id === "string" ? params.id : "";

  const [item, setItem] = useState<Item | null>(null);
  const {can, user: accessUser} = useAppAccess();
  const [showLabels,setShowLabels]=useState(false);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedStockIds, setSelectedStockIds] = useState<string[]>([]);
  const [bulkScope, setBulkScope] = useState<"selected" | "unselected">("selected");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkOperation,setBulkOperation]=useState<"EXCLUDE_INSPECTION"|"INCLUDE_INSPECTION"|"DELETE"|"RESTORE"|"SET_LOCATION"|"SET_ALLOCATION"|"SET_EXPIRY_ALERT">("EXCLUDE_INSPECTION");
  const [bulkLocation,setBulkLocation]=useState("");
  const [bulkAllocation,setBulkAllocation]=useState<"home"|"flea_market"|"warehouse">("home");
  const [bulkAlertDays,setBulkAlertDays]=useState(30);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const originalItemForm = useRef("");
  const [editingItem, setEditingItem] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);

  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(
    null
  );
  const [inventoryForm, setInventoryForm] =
    useState<InventoryForm | null>(null);

  const adminMode = useAdminMode();
  const canEditItem = can("ITEM_EDIT") || adminMode.active;
  const canEditInventory = can("INVENTORY_EDIT") || adminMode.active;

  const loadItem = useCallback(async (silent = false) => {
    if (!itemId) {
      setError("商品IDを確認できません。");
      setLoading(false);
      return;
    }

    try {
      if (!silent) { setLoading(true); setError(""); }

      const response = await fetchFresh(`/api/items/${itemId}`);

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(data, "商品情報を取得できませんでした。")
        );
      }

      setItem(normalizeItem(data));
    } catch (loadError) {
      if (silent) throw loadError;
      setItem(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "商品情報を取得できませんでした。"
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, [itemId]);

  const options = useRegistrationOptions(editingItem || editingInventoryId !== null);
  const { minorsFor } = options;
  useEffect(() => { if (options.ready) setLocations(options.storageLocationOptions); }, [options.ready, options.storageLocationOptions]);
  const syncFailed = useLiveRefresh(() => loadItem(true));

  useEffect(() => {
    void loadItem();
  }, [loadItem]);


  useEffect(() => {
    if (!canEditInventory) {
      setLocations([]);
      return;
    }

    const loadLocations = async () => {
      try {
        const response = await fetchFresh("/api/storage-locations");

        const data = await readJson(response);

        if (!response.ok) {
          setLocations([]);
          return;
        }

        if (Array.isArray(data)) {
          setLocations(data as StorageLocation[]);
          return;
        }

        if (
          data &&
          typeof data === "object" &&
          "locations" in data &&
          Array.isArray(data.locations)
        ) {
          setLocations(data.locations as StorageLocation[]);
          return;
        }

        setLocations([]);
      } catch {
        setLocations([]);
      }
    };

    void loadLocations();
  }, [canEditInventory]);

  const startItemEdit = () => {
    if (!item) {
      return;
    }

    setNotice("");
    setError("");
    originalItemForm.current = JSON.stringify(itemToForm(item));
    setItemForm(itemToForm(item));
    setEditingItem(true);
  };

  const cancelItemEdit = () => {
    if (saving) return;
    if (itemForm && JSON.stringify(itemForm) !== originalItemForm.current && !window.confirm("未保存の変更があります。変更を破棄して閉じますか？")) return;
    window.dispatchEvent(new CustomEvent("inventory:draft",{detail:{dirty:false}}));
    setEditingItem(false);
    setItemForm(null);
  };

  const startInventoryEdit = (inventory: InventoryInstance) => {
    setNotice("");
    setError("");
    setInventoryForm(inventoryToForm(inventory));
    setEditingInventoryId(inventory.id);
  };

  const cancelInventoryEdit = () => {
    window.dispatchEvent(new CustomEvent("inventory:draft",{detail:{dirty:false}}));
    setEditingInventoryId(null);
    setInventoryForm(null);
  };

  const saveItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!item || !itemForm) {
      return;
    }

    if (!itemForm.name.trim()) {
      setError("商品名を入力してください。");
      return;
    }

    if (!itemForm.reason.trim()) {
      setError("変更理由を入力してください。");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");

      const response = await fetch(`/api/items/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(itemForm),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(data, "商品情報を更新できませんでした。")
        );
      }

      window.dispatchEvent(new CustomEvent("inventory:draft",{detail:{dirty:false}}));
    setEditingItem(false);
      setItemForm(null);
      setNotice(
        "商品情報を更新しました。変更理由は管理者操作ログに記録されています。"
      );

      await loadItem();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "商品情報を更新できませんでした。"
      );
    } finally {
      setSaving(false);
    }
  };

  const saveInventory = async (
    event: FormEvent<HTMLFormElement>,
    inventoryId: string
  ) => {
    event.preventDefault();

    if (!inventoryForm) {
      return;
    }

    if (!inventoryForm.reason.trim()) {
      setError("変更理由を入力してください。");
      return;
    }

    const quantity = Number(inventoryForm.quantity);

    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("理論在庫は0以上の整数で入力してください。");
      return;
    }

    const actualQuantity =
      inventoryForm.actualQuantity.trim() === ""
        ? null
        : Number(inventoryForm.actualQuantity);

    if (
      actualQuantity !== null &&
      (!Number.isInteger(actualQuantity) || actualQuantity < 0)
    ) {
      setError("実在庫は0以上の整数で入力してください。");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");

      const response = await fetch(`/api/inventory/${inventoryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...inventoryForm,
          expirationNotApplicable: inventoryForm.expirationNotApplicable
            ? true
            : item?.inventoryInstances.find((entry) => entry.id === inventoryId)?.expirationDate &&
                item?.inventoryInstances.find((entry) => entry.id === inventoryId)?.expirationManagementStatus === "NO_EXPIRY"
              ? undefined
              : false,
          storageLocationId: inventoryForm.storageLocationId || null,
          quantity,
          actualQuantity,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(data, "在庫情報を更新できませんでした。")
        );
      }

      window.dispatchEvent(new CustomEvent("inventory:draft",{detail:{dirty:false}}));
    setEditingInventoryId(null);
      setInventoryForm(null);
      setNotice(
        "在庫情報を更新しました。変更内容は在庫履歴と管理者操作ログに記録されています。"
      );

      await loadItem();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "在庫情報を更新できませんでした。"
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteInventory = async (inventory: InventoryInstance) => {
    if (!item || saving || !(accessUser?.role === "ADMIN" || adminMode.active)) return;
    if (!window.confirm(`「${item.name}」の在庫明細（${inventory.storageLocation?.name ?? "保管場所未設定"}、Lot: ${inventory.lotNo ?? "未設定"}）を削除しますか？棚卸・取引・出品履歴は保持し、通常の作業画面から除外します。`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/inventory?id=${encodeURIComponent(inventory.id)}&expectedUpdatedAt=${encodeURIComponent(inventory.updatedAt)}`, { method: "DELETE" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(getMessage(data, "在庫を削除できませんでした。"));
      if (focusedInventory === inventory.id) setFocusedInventory("");
      setNotice("在庫を削除済みにしました。履歴は残っています。");
      await loadItem(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "在庫を削除できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async () => {
    if (!item || saving || !(accessUser?.role === "ADMIN" || adminMode.active)) return;
    if (!item.updatedAt) { setError("商品を再読み込みしてください。"); return; }
    if (!window.confirm(`商品「${item.name}」を削除済みにしますか？通常の検索・棚卸から除外されますが、履歴は残り、管理者が復元できます。`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/items/${encodeURIComponent(item.id)}?expectedUpdatedAt=${encodeURIComponent(item.updatedAt)}`, { method: "DELETE" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(getMessage(data, "商品を削除できませんでした。"));
      window.location.assign("/items");
    } catch (error) {
      setError(error instanceof Error ? error.message : "商品を削除できませんでした。");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-5">
        <div className="mx-auto max-w-6xl rounded-3xl bg-white p-10 text-center text-slate-500 shadow-sm">
          商品情報を読み込んでいます…
        </div>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-5">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-sm">
          <p className="font-black">
            {error || "商品情報を取得できませんでした。"}
          </p>


        </div>
      </main>
    );
  }

  const inventoryInstances = (item.inventoryInstances ?? []).filter(row=>!focusedInventory||row.id===focusedInventory);
  const deletedInventories = inventoryInstances.filter(stock=>stock.status==="廃止");
  const activeInventories = inventoryInstances.filter(stock=>stock.status!=="廃止");
  const selectableStocks = (item.inventoryInstances ?? []).filter(stock=>bulkOperation==="RESTORE" ? stock.status==="廃止" : stock.status!=="廃止");
  const selectedStocks = selectableStocks.filter(stock=>selectedStockIds.includes(stock.id));
  const bulkTargets = selectableStocks.filter(stock=>bulkScope==="selected" ? selectedStockIds.includes(stock.id) : !selectedStockIds.includes(stock.id));
  const toggleStock = (id:string) => { setSelectedStockIds(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]); setBulkConfirm(false); };
  const bulkLabels = {
    EXCLUDE_INSPECTION:"棚卸対象から外す", INCLUDE_INSPECTION:"棚卸対象に戻す",
    DELETE:"削除済みにする", RESTORE:"削除済みから復元",
    SET_LOCATION:"保管場所を変更", SET_ALLOCATION:"在庫区分を変更", SET_EXPIRY_ALERT:"期限通知日数を変更"
  } as const;
  const saveBulkOperation = async () => {
    if (!item || bulkBusy || saving || bulkTargets.length===0 || !bulkConfirm || bulkReason.trim().length<2) return;
    setBulkBusy(true);setError("");setNotice("");
    try {
      const response=await fetch("/api/inventory/bulk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        itemId:item.id,operation:bulkOperation,scope:bulkScope,
        selectedIds:selectedStocks.map(stock=>stock.id),reason:bulkReason.trim(),
        snapshots:(item.inventoryInstances??[]).map(stock=>({id:stock.id,expectedUpdatedAt:stock.updatedAt})),
        data:{storageLocationId:bulkLocation,allocationType:bulkAllocation,expirationAlertDays:bulkAlertDays}
      })});
      const data=await readJson(response);
      if(!response.ok)throw new Error(getMessage(data,"一括操作に失敗しました。"));
      setNotice(getMessage(data,"在庫を更新しました。"));
      setBulkReason("");setBulkConfirm(false);setSelectedStockIds([]);
      await loadItem(true);
    }catch(caught){setError(caught instanceof Error?caught.message:"一括操作に失敗しました。");}
    finally{setBulkBusy(false);}
  };

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 pb-20 sm:px-6 sm:py-6 sm:pb-24">
      {syncFailed && <p role="alert" className="mx-auto mb-3 max-w-6xl rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">同期できていません。表示は前回取得時点です。通信状況を確認してください。</p>}
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black tracking-widest text-blue-600">
              商品詳細
            </p>

            <h1 className="mt-1 break-words text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
              {item.name}
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              商品情報と在庫明細を分けて表示しています。操作したい在庫を選んでください。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => requestBack("/items")}
              className="rounded-xl bg-white px-4 py-3 font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              前の画面へ戻る
            </button>
          </div>
        </header>

        <section aria-label="JANの在庫明細" className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <ProductIdentity item={item}/>
          <p className="mt-2 font-bold">独立した在庫 {item.inventoryInstances.length}件</p>
          <p className="text-sm text-slate-600">在庫はロット・期限・保管場所ごとに個別管理されます。</p>
        </section>
        <FeedbackToast
          message={notice}
          tone="success"
          onClose={() => setNotice("")}
          autoCloseMs={5000}
        />
        <FeedbackToast
          message={error}
          tone="error"
          onClose={() => setError("")}
        />


        <div className="space-y-4">
          {editingItem && itemForm ? (
            <Modal titleId="item-edit-title" busy={saving} onClose={cancelItemEdit}>
              <h2 id="item-edit-title" className="text-xl font-black text-slate-950">
                商品情報を編集
              </h2>

              {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
              <form data-guard-unsaved className="mt-5" onSubmit={saveItem}><fieldset disabled={saving} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="font-bold text-slate-700">商品名</span>
                    <ImeInput
                      required
                      value={itemForm.name}
                      onChange={(event) =>
                        setItemForm({
                          ...itemForm,
                          name: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <ProductCodeField janCode={itemForm.janCode} systemBarcode={itemForm.systemBarcode} generateSystemBarcode={itemForm.generateSystemBarcode} onChange={codes=>setItemForm({...itemForm,...codes})}/>





                  <label className="block">
                    <span className="font-bold text-slate-700">メーカー</span>
                    <ImeInput
                      value={itemForm.manufacturer}
                      onChange={(event) =>
                        setItemForm({
                          ...itemForm,
                          manufacturer: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                    />
                  </label>

                  <label className="block">
                    <span className="font-bold text-slate-700">大分類</span>
                    <SelectOrCreate label="大分類" value={itemForm.majorCategory} options={options.majorCategories} onChange={(value) => setItemForm({ ...itemForm, majorCategory: value, minorCategory: "" })} />
                  </label>

                  <label className="block">
                    <span className="font-bold text-slate-700">小分類</span>
                    <SelectOrCreate label="小分類" value={itemForm.minorCategory} options={minorsFor(itemForm.majorCategory)} onChange={(value) => setItemForm({ ...itemForm, minorCategory: value })} />
                  </label>

                  <label className="block">
                    <span className="font-bold text-slate-700">既定単位</span>
                    <SelectOrCreate label="数量単位" value={itemForm.defaultUnit} options={options.units} onChange={(value) => setItemForm({ ...itemForm, defaultUnit: value })} />
                  </label>
                </div>

                <label className="block">
                  <span className="font-bold text-red-700">
                    変更理由（必須）
                  </span>
                  <textarea
                    required
                    rows={3}
                    value={itemForm.reason}
                    onChange={(event) =>
                      setItemForm({
                        ...itemForm,
                        reason: event.target.value,
                      })
                    }
                    placeholder="例：メーカー情報の誤記を修正"
                    className="mt-2 w-full rounded-xl border border-red-200 px-4 py-3"
                  />
                </label>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={cancelItemEdit}
                    disabled={saving}
                    className="rounded-xl bg-slate-200 px-5 py-3 font-bold text-slate-700"
                  >
                    変更を取り消す
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:bg-slate-400"
                  >
                    {saving ? "保存中…" : "商品情報を保存"}
                  </button>
                </div>
              </fieldset></form>
            </Modal>
          ) : (
            <details open className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-bold">商品共通情報（写真・メーカー・分類・単位）</summary>
              <div className="mt-3 grid grid-cols-[100px_minmax(0,1fr)] items-start gap-3"><ProductPhotos itemId={item.id} canEdit={canEditItem} compact/><div className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-black text-slate-950">商品情報</h2>{canEditItem&&<button onClick={startItemEdit} className="rounded-lg bg-blue-700 px-3 py-2 font-bold text-white">商品情報を編集</button>}</div><InventoryStatusBadges item={item} stocks={inventoryInstances}/><ProductIdentity item={item}/>

              <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">








                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    メーカー
                  </dt>
                  <dd className="mt-1 text-lg font-black text-slate-900">
                    {text(item.manufacturer)}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-bold text-slate-500">大分類</dt><dd className="mt-1 text-lg font-black text-slate-900">{item.majorCategory || "未設定"}</dd></div><div><dt className="text-sm font-bold text-slate-500">小分類</dt><dd className="mt-1 text-lg font-black text-slate-900">{item.minorCategory || "未設定"}</dd>
                </div>

                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    既定単位
                  </dt>
                  <dd className="mt-1 text-lg font-black text-slate-900">
                    {text(item.defaultUnit)}
                  </dd>
                </div>
              </dl></div></div>
            </details>
          )}

          {can("LABEL_PRINT")&&<section className="rounded-xl border bg-white p-3"><button type="button" aria-expanded={showLabels} onClick={()=>setShowLabels(value=>!value)} className="min-h-11 font-bold">JANラベルの表示・印刷 {showLabels?"を閉じる":"を開く"}</button>{showLabels&&<SystemBarcodeLabel
            itemId={item.id}
            itemName={item.name}
            janCode={item.janCode}
            initialSystemJan={item.systemBarcode} onUpdated={()=>loadItem(true)}
          />}</section>}

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  在庫明細
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  在庫ごとに数量・期限・保管場所を確認できます。削除しても過去の履歴は保持されます。
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
                通常 {activeInventories.length} 件
              </span>
            </div>

            {(accessUser?.role === "ADMIN" || adminMode.active) && !item.isArchived && (
              <button type="button" disabled={saving} onClick={() => void deleteItem()} className="mt-4 rounded-xl border border-red-300 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">
                この商品を削除
              </button>
            )}
            {(accessUser?.role==="ADMIN"||adminMode.active) && !item.isArchived && (item.inventoryInstances??[]).length>0 && (
              <details className="mt-4 rounded-xl border border-blue-200 bg-blue-50/40" open={undefined}>
                <summary className="cursor-pointer p-3 font-black text-slate-900 sm:p-4">在庫の一括管理 <span className="ml-2 text-sm font-medium text-slate-600">複数選択・対象切替・一括編集</span></summary>
                <div className="border-t border-blue-100 p-3 sm:p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block text-sm font-bold">操作内容
                      <select value={bulkOperation} onChange={e=>{setBulkOperation(e.target.value as typeof bulkOperation);setSelectedStockIds([]);setBulkConfirm(false);}} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3">
                        {Object.entries(bulkLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <fieldset className="rounded-lg border border-slate-200 bg-white p-3">
                      <legend className="px-1 text-sm font-bold">操作範囲</legend>
                      <label className="mr-4 inline-flex items-center gap-2 text-sm"><input type="radio" name="bulk-scope" checked={bulkScope==="selected"} onChange={()=>{setBulkScope("selected");setBulkConfirm(false);}}/>選択した在庫</label>
                      <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="bulk-scope" checked={bulkScope==="unselected"} onChange={()=>{setBulkScope("unselected");setBulkConfirm(false);}}/>選択していない在庫</label>
                    </fieldset>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{bulkOperation==="RESTORE"?"下の「削除済み在庫」から選択します。":"通常の在庫カードのチェックで選択します。"} 同じ商品内だけが操作対象です。</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={()=>{setSelectedStockIds(selectableStocks.map(s=>s.id));setBulkConfirm(false);}} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold">全件選択</button>
                    <button type="button" onClick={()=>{setSelectedStockIds([]);setBulkConfirm(false);}} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold">選択解除</button>
                    <button type="button" onClick={()=>{setSelectedStockIds(selectableStocks.filter(s=>!selectedStockIds.includes(s.id)).map(s=>s.id));setBulkConfirm(false);}} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold">選択反転</button>
                    <span className="self-center text-sm font-bold text-slate-700">{selectedStocks.length}/{selectableStocks.length}件選択</span>
                  </div>
                  {bulkOperation==="SET_LOCATION"&&<label className="mt-3 block text-sm font-bold">変更後の保管場所
                    <select value={bulkLocation} onChange={e=>{setBulkLocation(e.target.value);setBulkConfirm(false);}} className="mt-1 w-full rounded-lg border bg-white p-3">
                      <option value="">場所を選んでください</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </label>}
                  {bulkOperation==="SET_ALLOCATION"&&<label className="mt-3 block text-sm font-bold">変更後の在庫区分
                    <select value={bulkAllocation} onChange={e=>{setBulkAllocation(e.target.value as typeof bulkAllocation);setBulkConfirm(false);}} className="mt-1 w-full rounded-lg border bg-white p-3">
                      <option value="home">自宅</option><option value="warehouse">倉庫</option><option value="flea_market">フリーマーケット</option>
                    </select>
                  </label>}
                  {bulkOperation==="SET_EXPIRY_ALERT"&&<label className="mt-3 block text-sm font-bold">期限通知までの日数（0～365日）
                    <input type="number" min={0} max={365} value={bulkAlertDays} onChange={e=>{setBulkAlertDays(Number(e.target.value));setBulkConfirm(false);}} className="mt-1 w-full rounded-lg border bg-white p-3"/>
                  </label>}
                  <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-slate-900">実行前の確認：{bulkLabels[bulkOperation]}</strong>
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-black text-blue-800">{bulkTargets.length}件</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">削除・復元しても棚卸・取引履歴は残ります。変更前後と操作理由を監査ログに記録します。</p>
                    <div className="mt-2 max-h-44 space-y-1 overflow-auto text-sm">
                      {bulkTargets.map(stock=><p key={stock.id} className="break-words border-b border-slate-100 py-1">Lot {stock.lotNo||"未設定"} ・ {stock.storageLocation?.name||"場所未設定"} ・ {stock.quantity} {displayUnit(stock.unit,item.defaultUnit)}</p>)}
                      {!bulkTargets.length&&<p className="text-slate-500">操作する在庫はありません。</p>}
                    </div>
                  </div>
                  <label className="mt-3 block text-sm font-bold">変更理由
                    <textarea rows={2} maxLength={500} value={bulkReason} onChange={e=>{setBulkReason(e.target.value);setBulkConfirm(false);}} placeholder="例：保管場所の整理に伴う変更" className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3"/>
                  </label>
                  <label className="mt-3 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={bulkConfirm} onChange={e=>setBulkConfirm(e.target.checked)}/>対象・操作内容・変更理由を確認しました</label>
                  <button type="button" disabled={bulkBusy||saving||!bulkTargets.length||bulkReason.trim().length<2||!bulkConfirm||(bulkOperation==="SET_LOCATION"&&!bulkLocation)||(bulkOperation==="SET_EXPIRY_ALERT"&&(!Number.isInteger(bulkAlertDays)||bulkAlertDays<0||bulkAlertDays>365))} onClick={()=>void saveBulkOperation()} className="mt-3 w-full rounded-lg bg-blue-700 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto">{bulkBusy?"更新中…":bulkTargets.length+"件を一括更新"}</button>
                </div>
              </details>
            )}
            {focusedInventory&&<p className="my-4 rounded-xl bg-blue-50 p-3 font-bold">選んだ在庫だけを表示しています。Lot・保管場所を確認して、この明細を編集してください。<Link className="ml-3 underline" href={`/items/${item.id}`}>同じJANの全在庫を表示</Link></p>}
            {activeInventories.length === 0 ? (
              <div className="mt-5 rounded-2xl bg-slate-100 p-7 text-center text-slate-600">
                {focusedInventory ? "指定された在庫が見つかりません。同じJANの全在庫から対象を確認してください。" : "登録されている在庫はありません。"}
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {activeInventories.map((inventory) => {
                  const editing = editingInventoryId === inventory.id;

                  return (
                    <article
                      key={inventory.id}
                      id={`inventory-${inventory.id}`}
                      className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-5"
                    >
                      {(accessUser?.role === "ADMIN" || adminMode.active) && !item.isArchived && inventory.status !== "廃止" && (
                        <label className="mb-3 flex cursor-pointer items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-700">
                          <input type="checkbox" disabled={bulkOperation==="RESTORE"} checked={selectedStockIds.includes(inventory.id)} onChange={()=>toggleStock(inventory.id)} className="h-5 w-5 shrink-0"/>
                          一括操作の対象として選択
                        </label>
                      )}
                      {editing && inventoryForm ? (
                        <form
                          data-guard-unsaved
                          className="space-y-5"
                          onSubmit={(event) =>
                            void saveInventory(event, inventory.id)
                          }
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-blue-600">
                                編集
                              </p>
                              <h3 className="mt-1 text-lg font-black text-slate-950">
                                在庫情報を編集
                              </h3>
                            </div>

                            <button
                              type="button"
                              onClick={cancelInventoryEdit}
                              disabled={saving}
                              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700"
                            >
                              閉じる
                            </button>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <label className="block">
                              <span className="font-bold text-slate-700">
                                保管場所
                              </span>
                              <select
                                value={inventoryForm.storageLocationId}
                                onChange={(event) =>
                                  setInventoryForm({
                                    ...inventoryForm,
                                    storageLocationId: event.target.value,
                                  })
                                }
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                              >
                                <option value="">未設定</option>
                                {locations.map((location) => (
                                  <option
                                    key={location.id}
                                    value={location.id}
                                  >
                                    {location.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="block">
                              <span className="font-bold text-slate-700">
                                理論在庫
                              </span>
                              <ImeInput
                                type="number"
                                min="0"
                                value={inventoryForm.quantity}
                                onChange={(event) =>
                                  setInventoryForm({
                                    ...inventoryForm,
                                    quantity: event.target.value,
                                  })
                                }
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                              />
                            </label>

                            <label className="block">
                              <span className="font-bold text-slate-700">
                                実在庫
                              </span>
                              <ImeInput
                                type="number"
                                min="0"
                                value={inventoryForm.actualQuantity}
                                onChange={(event) =>
                                  setInventoryForm({
                                    ...inventoryForm,
                                    actualQuantity: event.target.value,
                                  })
                                }
                                placeholder="未入力"
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                              />
                            </label>

                            <label className="block">
                              <span className="font-bold text-slate-700">
                                ロット番号
                              </span>
                              <ImeInput
                                value={inventoryForm.lotNo}
                                onChange={(event) =>
                                  setInventoryForm({
                                    ...inventoryForm,
                                    lotNo: event.target.value,
                                  })
                                }
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                              />
                            </label>

                            <div className="block">
                              <span className="font-bold text-slate-700">
                                使用期限（年月のみ・年月日）
                              </span>
                              <label className="mt-2 flex items-center gap-2 font-bold">
                                <ImeInput type="checkbox" checked={inventoryForm.expirationNotApplicable} onChange={(event) => setInventoryForm({ ...inventoryForm, expirationNotApplicable: event.target.checked, expirationDate: "" })} className="h-5 w-5" />
                                期限なし
                              </label>
                              {!inventoryForm.expirationNotApplicable && <>
                              <span className="mt-1 block text-sm font-semibold text-slate-600">年月までなら左、日付まであれば右を使用してください。</span>
                              <span className="mt-2 grid gap-2 sm:grid-cols-2">
                                <span><span className="text-xs font-bold">年月まで</span><ImeInput type="month" value={inventoryForm.expirationDate.length === 7 ? inventoryForm.expirationDate : ""} onChange={(event) => setInventoryForm({ ...inventoryForm, expirationDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" /></span>
                                <span><span className="text-xs font-bold">日付まで</span><ImeInput type="date" value={inventoryForm.expirationDate.length === 10 ? inventoryForm.expirationDate : ""} onChange={(event) => setInventoryForm({ ...inventoryForm, expirationDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" /></span>
                              </span>
                              </>}
                              <span className="mt-2 block text-xs font-bold text-blue-800">保存値：{inventoryForm.expirationNotApplicable ? "期限なし" : inventoryForm.expirationDate || "期限未設定"}</span>
                            </div>

                            <label className="block">
                              <span className="font-bold text-slate-700">
                                単位
                              </span>
                              <SelectOrCreate label="数量単位" value={inventoryForm.unit} options={options.units} onChange={(value) => setInventoryForm({ ...inventoryForm, unit: value })} />
                            </label>

                            <label className="block">
                              <span className="font-bold text-slate-700">
                                在庫区分
                              </span>
                              <select
                                value={inventoryForm.allocationType}
                                onChange={(event) =>
                                  setInventoryForm({
                                    ...inventoryForm,
                                    allocationType: event.target
                                      .value as InventoryForm["allocationType"],
                                  })
                                }
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                              >
                                <option value="home">自宅</option>
                                <option value="warehouse">倉庫</option>
                                <option value="flea_market">
                                  フリーマーケット
                                </option>
                              </select>
                            </label>

                            <label className="block">
                              <span className="font-bold text-slate-700">
                                在庫状態
                              </span>
                              <ImeInput
                                value={inventoryForm.status}
                                onChange={(event) =>
                                  setInventoryForm({
                                    ...inventoryForm,
                                    status: event.target.value,
                                  })
                                }
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                              />
                            </label>

                            <label className="block">
                              <span className="font-bold text-slate-700">
                                棚卸状態
                              </span>
                              <ImeInput
                                value={inventoryForm.stocktakeStatus}
                                onChange={(event) =>
                                  setInventoryForm({
                                    ...inventoryForm,
                                    stocktakeStatus: event.target.value,
                                  })
                                }
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                              />
                            </label>
                          </div>

                          <label className="block">
                            <span className="font-bold text-red-700">
                              変更理由（必須）
                            </span>
                            <textarea
                              required
                              rows={3}
                              value={inventoryForm.reason}
                              onChange={(event) =>
                                setInventoryForm({
                                  ...inventoryForm,
                                  reason: event.target.value,
                                })
                              }
                              placeholder="例：実地確認により在庫数を修正"
                              className="mt-2 w-full rounded-xl border border-red-200 px-4 py-3"
                            />
                          </label>

                          <label className="block">
                            <span className="font-bold text-slate-700">
                              補足メモ
                            </span>
                            <textarea
                              rows={2}
                              value={inventoryForm.memo}
                              onChange={(event) =>
                                setInventoryForm({
                                  ...inventoryForm,
                                  memo: event.target.value,
                                })
                              }
                              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                            />
                          </label>

                          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <button
                              type="button"
                              onClick={cancelInventoryEdit}
                              disabled={saving}
                              className="rounded-xl bg-slate-200 px-5 py-3 font-bold text-slate-700"
                            >
                              変更を取り消す
                            </button>

                            <button
                              type="submit"
                              disabled={saving}
                              className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:bg-slate-400"
                            >
                              {saving ? "保存中…" : "在庫情報を保存"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="break-words text-lg font-black text-slate-950">
                                Lot：{inventory.lotNo || "未設定"}
                              </h3>
                              <span className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">{inventory.storageLocation?.name || "保管場所未設定"}</span>

                              <span
                                className={`rounded-full px-3 py-1 text-sm font-bold ${
                                  inventory.stocktakeStatus === "棚卸済"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-orange-100 text-orange-700"
                                }`}
                              >
                                {text(inventory.stocktakeStatus)}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
                              <p><span className="block text-xs font-bold text-slate-500">使用期限</span><strong>{!inventory.expirationDate && inventory.expirationManagementStatus==="NO_EXPIRY" ? "期限なし" : formatDate(inventory.expirationDate)}</strong></p>
                              <p><span className="block text-xs font-bold text-slate-500">棚卸対象</span><strong>{inventory.inspectionExcluded ?? item.inspectionExcluded ? "対象外" : "対象"}</strong></p>
                              <p><span className="block text-xs font-bold text-slate-500">在庫区分</span><strong>{allocationLabel(inventory.allocationType)}</strong></p>
                            </div>
                            <details className="mt-3 rounded-lg border border-slate-200">
                              <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-slate-700">分類・管理番号・更新日時などを表示</summary>
                              <dl className="grid gap-3 border-t border-slate-100 p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                              <div>
                                <dt className="font-bold text-slate-500">この在庫の分類</dt>
                                <dd className="mt-1 text-slate-800">{[inventory.majorCategory, inventory.minorCategory].filter(Boolean).join(" ／ ") || "未設定"}</dd>
                              </div>
                              <div>
                                <dt className="font-bold text-slate-500">在庫システムNo.</dt>
                                <dd className="mt-1 break-all text-slate-800">{inventory.id}</dd>
                              </div>
                              <div>
                                <dt className="font-bold text-slate-500">
                                  ロット番号
                                </dt>
                                <dd className="mt-1 text-slate-800">
                                  {text(inventory.lotNo)}
                                </dd>
                              </div>

                              <div>
                                <dt className="font-bold text-slate-500">
                                  使用期限
                                </dt>
                                <dd className="mt-1 text-slate-800">
                                  {!inventory.expirationDate && inventory.expirationManagementStatus === "NO_EXPIRY" ? "期限なし" : formatDate(inventory.expirationDate)}<span className="mt-1 block font-bold">期限管理：{expiryPolicyLabels[expiryPolicy(inventory.expirationDate, inventory.expirationManagementStatus)]}</span><Link href={`/expiry?itemId=${item.id}&inventoryId=${encodeURIComponent(inventory.id)}`} className="underline">期限管理を設定</Link>
                                </dd>
                              </div>

                              <div>
                                <dt className="font-bold text-slate-500">
                                  在庫区分
                                </dt>
                                <dd className="mt-1 text-slate-800">
                                  {allocationLabel(inventory.allocationType)}
                                </dd>
                              </div>

                              <div>
                                <dt className="font-bold text-slate-500">
                                  最終更新
                                </dt>
                                <dd className="mt-1 text-slate-800">
                                  {formatDate(inventory.updatedAt)}
                                </dd>
                              </div>
                              </dl>
                            </details>
                          </div>

                          <StockStateSummary stocks={[inventory]} defaultUnit={item.defaultUnit} itemId={item.id} inventoryId={inventory.id}/>
                          <div className="flex flex-wrap items-start gap-3">
                            <div className="rounded-2xl bg-blue-50 px-5 py-3 text-right">
                              <p className="text-sm font-bold text-slate-500">
                                現在在庫
                              </p>
                              <p className="text-3xl font-black text-blue-700">
                                {inventory.quantity}
                                <span className="ml-1 text-base">
                                  {displayUnit(inventory.unit, item.defaultUnit)}
                                </span>
                              </p>
                            </div>

                            {inventory.actualQuantity !== null && (
                              <p className="text-sm font-bold text-slate-600">
                                実在庫：{inventory.actualQuantity}
                                {displayUnit(inventory.unit, item.defaultUnit)}
                              </p>
                            )}

                            <Link href={`/history?inventoryId=${encodeURIComponent(inventory.id)}`} className="rounded-xl border p-3 font-bold">この在庫の数量履歴</Link>
                            <details className="w-full rounded-xl border border-slate-200 bg-slate-50">
                              <summary className="cursor-pointer px-4 py-3 text-sm font-black text-slate-800">この在庫の管理操作（編集・対象外・削除）</summary>
                              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-3">
                                <InventoryLifecycle stock={inventory} groupExcluded={item.inspectionExcluded === true} canManage={accessUser?.role === "ADMIN" || adminMode.active} onSaved={() => loadItem(true)} onDelete={inventory.status === "廃止" ? undefined : () => void deleteInventory(inventory)} deleting={saving}/>
                            {canEditInventory && (
                              <button
                                type="button"
                                onClick={() => startInventoryEdit(inventory)}
                                className="rounded-xl bg-slate-800 px-4 py-3 text-sm font-bold text-white hover:bg-slate-950"
                              >
                                在庫情報を編集
                              </button>
                            )}
                              </div>
                            </details>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            {(accessUser?.role==="ADMIN"||adminMode.active) && deletedInventories.length>0 && (
              <details className="mt-5 rounded-xl border border-amber-200 bg-amber-50/50">
                <summary className="cursor-pointer p-4 font-bold text-amber-900">削除済み在庫を表示（{deletedInventories.length}件・管理者のみ）</summary>
                <div className="space-y-2 border-t border-amber-200 p-3">
                  <p className="text-sm text-amber-900">通常の棚卸・検索には表示されません。復元する場合は上の「在庫の一括管理」で操作内容を「削除済みから復元」にしてください。</p>
                  {deletedInventories.map(stock=><div key={stock.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-white p-3">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm font-bold">
                      <input type="checkbox" disabled={bulkOperation!=="RESTORE"} checked={selectedStockIds.includes(stock.id)} onChange={()=>toggleStock(stock.id)} className="h-5 w-5 shrink-0"/>
                      <span className="min-w-0 break-words">Lot：{stock.lotNo||"未設定"} ／ {stock.storageLocation?.name||"保管場所未設定"} ／ {stock.quantity} {displayUnit(stock.unit,item.defaultUnit)}</span>
                    </label>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">削除済み</span>
                  </div>)}
                </div>
              </details>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
