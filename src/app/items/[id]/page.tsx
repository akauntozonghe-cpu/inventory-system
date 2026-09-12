"use client";

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
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import SystemBarcodeLabel from "@/components/SystemBarcodeLabel";
import FeedbackToast from "@/components/common/FeedbackToast";

import SelectOrCreate from "@/components/SelectOrCreate";
import { useRegistrationOptions } from "@/hooks/useRegistrationOptions";
import { displayUnit } from "@/lib/unit";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";

type CurrentUser = {
  id: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
};

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
  createdAt?: string;
  isArchived?: boolean;
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

function normalizeUser(data: unknown): CurrentUser | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;
  const candidate =
    "user" in payload && payload.user !== null ? payload.user : payload;

  if (
    !candidate ||
    typeof candidate !== "object" ||
    !("id" in candidate) ||
    !("displayName" in candidate) ||
    !("role" in candidate) ||
    typeof candidate.id !== "string" ||
    typeof candidate.displayName !== "string" ||
    (candidate.role !== "ADMIN" && candidate.role !== "WORKER")
  ) {
    return null;
  }

  return {
    id: candidate.id,
    displayName: candidate.displayName,
    role: candidate.role,
  };
}

function itemToForm(item: Item): ItemForm {
  return {
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
  const router = useRouter();

  const itemId = typeof params.id === "string" ? params.id : "";

  const [item, setItem] = useState<Item | null>(null);
  const {user:currentUser} = useAppAccess();
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [editingItem, setEditingItem] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);

  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(
    null
  );
  const [inventoryForm, setInventoryForm] =
    useState<InventoryForm | null>(null);

  const adminMode = useAdminMode();
  const isAdmin = Boolean(currentUser) && (currentUser?.role === "ADMIN" || adminMode.active);

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

  const options = useRegistrationOptions();
  const { minorsFor } = options;
  useEffect(() => { if (options.ready) setLocations(options.storageLocationOptions); }, [options.ready, options.storageLocationOptions]);
  const syncFailed = useLiveRefresh(() => loadItem(true));

  useEffect(() => {
    void loadItem();
  }, [loadItem]);


  useEffect(() => {
    if (!isAdmin) {
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
  }, [isAdmin]);

  const startItemEdit = () => {
    if (!item) {
      return;
    }

    setNotice("");
    setError("");
    setItemForm(itemToForm(item));
    setEditingItem(true);
  };

  const cancelItemEdit = () => {
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
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black tracking-widest text-blue-600">
              商品詳細
            </p>

            <h1 className="mt-1 break-words text-3xl font-black text-slate-950 sm:text-4xl">
              {item.name}
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              商品マスターと、商品ごとの在庫・ロット・保管場所を確認できます。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isAdmin && !editingItem && (
              <button
                type="button"
                onClick={startItemEdit}
                className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700"
              >
                商品情報を編集
              </button>
            )}

            <button
              type="button"
              onClick={() => router.push("/items")}
              className="rounded-xl bg-white px-4 py-3 font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              商品一覧へ戻る
            </button>
          </div>
        </header>

        <section aria-label="対象の在庫" className="mb-5 rounded-2xl border-2 border-teal-300 bg-white p-4">
          <h2 className="text-xl font-black">{focusedInventory?"開いている在庫":"この商品の在庫"}</h2>
          <p className="my-2 text-sm">{[item.majorCategory,item.minorCategory].filter(Boolean).join(" ／ ")} · {item.inventoryInstances.length}明細</p>
          {item.inventoryInstances.length>1&&<label className="block font-bold">Lot・保管場所で在庫を選ぶ<select aria-label="Lot・保管場所で在庫を選ぶ" value={focusedInventory} onChange={event=>setFocusedInventory(event.target.value)} className="mt-2 w-full rounded-xl border p-3"><option value="">すべての在庫</option>{item.inventoryInstances.map(row=><option key={row.id} value={row.id}>{row.storageLocation?.name||"場所未設定"} ／ Lot {row.lotNo||"なし"} ／ {row.quantity} {displayUnit(row.unit,item.defaultUnit)} ／ {row.status}</option>)}</select></label>}
          {focusedInventory&&!inventoryInstances.length&&<p role="alert" className="my-3 font-bold text-red-700">指定された在庫が見つかりません。上の選択から最新の在庫を確認してください。</p>}
          <div className="mt-3 max-h-80 space-y-2 overflow-auto">{inventoryInstances.map(row=><article key={row.id} className="rounded-xl bg-teal-50 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-lg font-black">{row.storageLocation?.name||"保管場所未設定"} ／ Lot {row.lotNo||"なし"}</p><InventoryStatusBadges item={{isArchived:item.isArchived}} stocks={[row]}/><p className="mt-1">状態：{row.status} ／ 棚卸：{row.stocktakeStatus}</p><p className="mt-1 text-2xl font-black">{row.quantity} {displayUnit(row.unit,item.defaultUnit)}</p></div><button className="rounded-xl border bg-white p-3 font-bold" onClick={()=>{setFocusedInventory(row.id);requestAnimationFrame(()=>document.getElementById("inventory-"+row.id)?.scrollIntoView({behavior:"smooth",block:"start"}));}}>この在庫の明細へ</button></div></article>)}</div>
          <StockStateSummary stocks={inventoryInstances} defaultUnit={item.defaultUnit} itemId={item.id} inventoryId={focusedInventory||undefined}/>
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
            <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-xl font-black text-slate-950">
                商品情報を編集
              </h2>

              <form className="mt-5 space-y-5" onSubmit={saveItem}>
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
              </form>
            </section>
          ) : (
            <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
              <ProductPhotos itemId={item.id} canEdit={isAdmin}/><h2 className="text-xl font-black text-slate-950">商品情報</h2><InventoryStatusBadges item={item} stocks={inventoryInstances}/><ProductIdentity item={item}/>

              <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">








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
              </dl>
            </section>
          )}

          <SystemBarcodeLabel
            itemId={item.id}
            itemName={item.name}
            janCode={item.janCode}
            initialSystemJan={item.systemBarcode} onUpdated={()=>loadItem(true)}
          />

          <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  在庫詳細
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  保管場所・ロット・使用期限ごとに分かれた在庫です。
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
                {inventoryInstances.length} 件
              </span>
            </div>

            {focusedInventory&&<p className="my-4 rounded-xl bg-blue-50 p-3 font-bold">選んだ在庫だけを表示しています。Lot・保管場所を確認して、この明細を編集してください。<button className="ml-3 underline" onClick={()=>setFocusedInventory("")}>この商品の全在庫を表示</button><Link href="/admin/recovery" className="ml-3 underline">点検へ戻って再確認</Link></p>}
            {inventoryInstances.length === 0 ? (
              <div className="mt-5 rounded-2xl bg-slate-100 p-7 text-center text-slate-600">
                登録されている在庫はありません。
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

                            <label className="block">
                              <span className="font-bold text-slate-700">
                                使用期限（年月のみ・年月日）
                              </span>
                              <span className="mt-1 block text-sm font-semibold text-slate-600">年月までなら左、日付まであれば右を使用してください。</span>
                              <span className="mt-2 grid gap-2 sm:grid-cols-2">
                                <span><span className="text-xs font-bold">年月まで</span><input type="month" value={inventoryForm.expirationDate.length === 7 ? inventoryForm.expirationDate : ""} onChange={(event) => setInventoryForm({ ...inventoryForm, expirationDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" /></span>
                                <span><span className="text-xs font-bold">日付まで</span><input type="date" value={inventoryForm.expirationDate.length === 10 ? inventoryForm.expirationDate : ""} onChange={(event) => setInventoryForm({ ...inventoryForm, expirationDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" /></span>
                              </span>
                              <span className="mt-2 block text-xs font-bold text-blue-800">保存値：{inventoryForm.expirationDate || "日付未登録（期限管理の設定は別途確認）"}</span>
                            </label>

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
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
                                  {formatDate(inventory.expirationDate)}<span className="mt-1 block font-bold">期限管理：{expiryPolicyLabels[expiryPolicy(inventory.expirationDate, inventory.expirationManagementStatus)]}</span><Link href={`/expiry?itemId=${item.id}`} className="underline">期限管理を設定</Link>
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
                          <div className="flex flex-wrap items-end gap-3 sm:flex-col sm:items-end">
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

                            {isAdmin && (
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
