"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SystemBarcodeLabel from "@/components/SystemBarcodeLabel";

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
  managementCode: string | null;
  managementGroupCode: string | null;
  manufacturer: string | null;
  majorCategory: string | null;
  minorCategory: string | null;
  lotNo: string | null;
  expirationDate: string | null;
  unit: string | null;
  allocationType: "home" | "flea_market" | "warehouse";
  status: string;
  stocktakeStatus: string;
  updatedAt: string;
  storageLocationId: string | null;
  storageLocation: StorageLocation | null;
};

type Item = {
  id: string;
  name: string;
  janCode: string | null;
  systemBarcode: string | null;
  managementCode: string | null;
  managementGroupCode: string | null;
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
  managementCode: string;
  managementGroupCode: string;
  manufacturer: string;
  majorCategory: string;
  minorCategory: string;
  defaultUnit: string;
  reason: string;
};

type InventoryForm = {
  storageLocationId: string;
  managementCode: string;
  managementGroupCode: string;
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
    managementCode: item.managementCode ?? "",
    managementGroupCode: item.managementGroupCode ?? "",
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
    managementCode: inventory.managementCode ?? "",
    managementGroupCode: inventory.managementGroupCode ?? "",
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
  const router = useRouter();

  const itemId = typeof params.id === "string" ? params.id : "";

  const [item, setItem] = useState<Item | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
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

  const isAdmin = currentUser?.role === "ADMIN";

  const loadItem = useCallback(async () => {
    if (!itemId) {
      setError("商品IDを確認できません。");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/items/${itemId}`, {
        cache: "no-store",
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(data, "商品情報を取得できませんでした。")
        );
      }

      setItem(normalizeItem(data));
    } catch (loadError) {
      setItem(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "商品情報を取得できませんでした。"
      );
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void loadItem();
  }, [loadItem]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        const data = await readJson(response);

        if (response.ok) {
          setCurrentUser(normalizeUser(data));
          return;
        }

        setCurrentUser(null);
      } catch {
        setCurrentUser(null);
      }
    };

    void loadUser();
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setLocations([]);
      return;
    }

    const loadLocations = async () => {
      try {
        const response = await fetch("/api/storage-locations", {
          cache: "no-store",
        });

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
      <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
        <div className="mx-auto max-w-6xl rounded-3xl bg-white p-10 text-center text-slate-500 shadow-sm">
          商品情報を読み込んでいます…
        </div>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-sm">
          <p className="font-black">
            {error || "商品情報を取得できませんでした。"}
          </p>

          <Link
            href="/items"
            className="mt-5 inline-flex rounded-xl bg-slate-800 px-5 py-3 font-bold text-white"
          >
            商品一覧へ戻る
          </Link>
        </div>
      </main>
    );
  }

  const inventoryInstances = item.inventoryInstances ?? [];

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24 sm:p-8">
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

        {notice && (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-bold text-emerald-800">
            {notice}
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-bold text-red-700">
            {error}
          </div>
        )}

        {isAdmin && (
          <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
            <span className="font-black">管理者モード：</span>
            商品・在庫情報の変更には理由の入力が必要です。すべての変更は操作ログへ記録されます。
          </div>
        )}

        <div className="space-y-6">
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

                  <label className="block">
                    <span className="font-bold text-slate-700">
                      既存JANコード
                    </span>
                    <input
                      value={itemForm.janCode}
                      onChange={(event) =>
                        setItemForm({
                          ...itemForm,
                          janCode: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                    />
                  </label>

                  <label className="block">
                    <span className="font-bold text-slate-700">
                      システムバーコード
                    </span>
                    <input
                      value={itemForm.systemBarcode}
                      onChange={(event) =>
                        setItemForm({
                          ...itemForm,
                          systemBarcode: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                    />
                  </label>

                  <label className="block">
                    <span className="font-bold text-slate-700">管理番号</span>
                    <input
                      value={itemForm.managementCode}
                      onChange={(event) =>
                        setItemForm({
                          ...itemForm,
                          managementCode: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                    />
                  </label>

                  <label className="block">
                    <span className="font-bold text-slate-700">
                      管理グループコード
                    </span>
                    <input
                      value={itemForm.managementGroupCode}
                      onChange={(event) =>
                        setItemForm({
                          ...itemForm,
                          managementGroupCode: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                    />
                  </label>

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
                    <input
                      value={itemForm.majorCategory}
                      onChange={(event) =>
                        setItemForm({
                          ...itemForm,
                          majorCategory: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                    />
                  </label>

                  <label className="block">
                    <span className="font-bold text-slate-700">小分類</span>
                    <input
                      value={itemForm.minorCategory}
                      onChange={(event) =>
                        setItemForm({
                          ...itemForm,
                          minorCategory: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                    />
                  </label>

                  <label className="block">
                    <span className="font-bold text-slate-700">既定単位</span>
                    <input
                      value={itemForm.defaultUnit}
                      onChange={(event) =>
                        setItemForm({
                          ...itemForm,
                          defaultUnit: event.target.value,
                        })
                      }
                      placeholder="個、箱、本 など"
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
              <h2 className="text-xl font-black text-slate-950">商品情報</h2>

              <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    既存JANコード
                  </dt>
                  <dd className="mt-1 break-all text-lg font-black text-slate-900">
                    {text(item.janCode)}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    システムバーコード
                  </dt>
                  <dd className="mt-1 break-all text-lg font-black text-slate-900">
                    {text(item.systemBarcode)}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    管理番号
                  </dt>
                  <dd className="mt-1 text-lg font-black text-slate-900">
                    {text(item.managementCode)}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    管理グループコード
                  </dt>
                  <dd className="mt-1 text-lg font-black text-slate-900">
                    {text(item.managementGroupCode)}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-bold text-slate-500">
                    メーカー
                  </dt>
                  <dd className="mt-1 text-lg font-black text-slate-900">
                    {text(item.manufacturer)}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-bold text-slate-500">分類</dt>
                  <dd className="mt-1 text-lg font-black text-slate-900">
                    {[item.majorCategory, item.minorCategory]
                      .filter(Boolean)
                      .join(" / ") || "-"}
                  </dd>
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
            initialSystemJan={item.systemBarcode}
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
                                管理者編集
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
                                使用期限
                              </span>
                              <input
                                value={inventoryForm.expirationDate}
                                onChange={(event) =>
                                  setInventoryForm({
                                    ...inventoryForm,
                                    expirationDate: event.target.value,
                                  })
                                }
                                placeholder="例：2027-08-31"
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                              />
                            </label>

                            <label className="block">
                              <span className="font-bold text-slate-700">
                                単位
                              </span>
                              <input
                                value={inventoryForm.unit}
                                onChange={(event) =>
                                  setInventoryForm({
                                    ...inventoryForm,
                                    unit: event.target.value,
                                  })
                                }
                                placeholder="個、箱、本 など"
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                              />
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
                                  {formatDate(inventory.expirationDate)}
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

                          <div className="flex flex-wrap items-end gap-3 sm:flex-col sm:items-end">
                            <div className="rounded-2xl bg-blue-50 px-5 py-3 text-right">
                              <p className="text-sm font-bold text-slate-500">
                                現在在庫
                              </p>
                              <p className="text-3xl font-black text-blue-700">
                                {inventory.quantity}
                                <span className="ml-1 text-base">
                                  {inventory.unit ?? item.defaultUnit ?? "個"}
                                </span>
                              </p>
                            </div>

                            {inventory.actualQuantity !== null && (
                              <p className="text-sm font-bold text-slate-600">
                                実在庫：{inventory.actualQuantity}
                                {inventory.unit ?? item.defaultUnit ?? "個"}
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