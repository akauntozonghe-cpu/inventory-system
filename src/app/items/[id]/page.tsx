"use client";

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

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24 sm:p-5">
      <p role="status" className="mx-auto mb-3 max-w-6xl text-sm font-bold">{syncFailed ? "同期できていません。表示は前回取得時点です。" : "在庫情報を自動更新中（通信時間＋約1秒）。編集中の入力は保持します。"}</p>
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black tracking-widest text-blue-600">
              商品詳細
            </p>

            <h1 className="mt-1 break-words text-3xl font-black text-slate-950 sm:text-4xl">
              {item.name}
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              対象の明細を選んで編集・廃止・点検設定を行えます。
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

        <section aria-label="JANの在庫明細" className="mb-4 rounded-xl bg-white p-4">
          <ProductIdentity item={item}/>
          <p className="mt-2 font-bold">独立した在庫 {item.inventoryInstances.length}件</p>
          <p className="text-sm text-slate-600">同じJANの在庫を一覧にしています。分類・Lot・期限・保管場所・点検設定は各明細で管理します。</p>
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
              <form className="mt-5" onSubmit={saveItem}><fieldset disabled={saving} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="font-bold text-slate-700">商品名</span>
                    <input
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

                  <ProductCodeField janCode={itemForm.janCode} systemBarcode={itemForm.systemBarcode} onChange={codes=>setItemForm({...itemForm,...codes})}/>





                  <label className="block">
                    <span className="font-bold text-slate-700">メーカー</span>
                    <input
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
            <details className="rounded-xl bg-white p-4"><summary className="cursor-pointer font-bold">JAN共通の商品名・写真・登録時の既定値</summary>
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

          <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  在庫詳細
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  各枠が独立した在庫です。テスト登録や誤登録も、その明細だけ廃止・点検対象外にできます。
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
                {inventoryInstances.length} 件
              </span>
            </div>

            {focusedInventory&&<p className="my-4 rounded-xl bg-blue-50 p-3 font-bold">選んだ在庫だけを表示しています。Lot・保管場所を確認して、この明細を編集してください。<Link className="ml-3 underline" href={`/items/${item.id}`}>同じJANの全在庫を表示</Link></p>}
            {inventoryInstances.length === 0 ? (
              <div className="mt-5 rounded-2xl bg-slate-100 p-7 text-center text-slate-600">
                {focusedInventory ? "指定された在庫が見つかりません。同じJANの全在庫から対象を確認してください。" : "登録されている在庫はありません。"}
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {inventoryInstances.map((inventory) => {
                  const editing = editingInventoryId === inventory.id;

                  return (
                    <article
                      key={inventory.id}
                      id={`inventory-${inventory.id}`}
                      className="rounded-2xl border border-slate-200 p-4 sm:p-5"
                    >
                      {editing && inventoryForm ? (
                        <form
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
                              <input
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
                              <input
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
                              <input
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
                                <input type="checkbox" checked={inventoryForm.expirationNotApplicable} onChange={(event) => setInventoryForm({ ...inventoryForm, expirationNotApplicable: event.target.checked, expirationDate: "" })} className="h-5 w-5" />
                                期限なし
                              </label>
                              {!inventoryForm.expirationNotApplicable && <>
                              <span className="mt-1 block text-sm font-semibold text-slate-600">年月までなら左、日付まであれば右を使用してください。</span>
                              <span className="mt-2 grid gap-2 sm:grid-cols-2">
                                <span><span className="text-xs font-bold">年月まで</span><input type="month" value={inventoryForm.expirationDate.length === 7 ? inventoryForm.expirationDate : ""} onChange={(event) => setInventoryForm({ ...inventoryForm, expirationDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" /></span>
                                <span><span className="text-xs font-bold">日付まで</span><input type="date" value={inventoryForm.expirationDate.length === 10 ? inventoryForm.expirationDate : ""} onChange={(event) => setInventoryForm({ ...inventoryForm, expirationDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" /></span>
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
                              <input
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
                              <input
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
                        <div className="space-y-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-black text-slate-950">
                                {inventory.storageLocation?.name ?? "保管場所未設定"}
                              </h3>

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

                            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
                            <InventoryLifecycle stock={inventory} groupExcluded={item.inspectionExcluded === true} canManage={accessUser?.role === "ADMIN"} onSaved={() => loadItem(true)}/>
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
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
