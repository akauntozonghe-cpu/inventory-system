"use client";

import { useEffect, useState } from "react";

type Location = {
  id: string;
  name: string;
};

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

type UnregisteredItemDialogProps = {
  open: boolean;
  sessionId: string;
  initialJanCode: string;
  onClose: () => void;
  onRegistered: (result: RegisteredInventory) => void;
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

export default function UnregisteredItemDialog({
  open,
  sessionId,
  initialJanCode,
  onClose,
  onRegistered,
}: UnregisteredItemDialogProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    name: "",
    janCode: "",
    managementCode: "",
    manufacturer: "",
    majorCategory: "",
    minorCategory: "",
    unit: "個",
    storageLocationId: "",
    quantity: "0",
    lotNo: "",
    expirationDate: "",
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm((previous) => ({
      ...previous,
      janCode: initialJanCode,
    }));
  }, [initialJanCode, open]);

  useEffect(() => {
    if (!open || locations.length > 0) {
      return;
    }

    const loadLocations = async () => {
      setLoadingLocations(true);

      try {
        const response = await fetch("/api/storage-locations", {
          cache: "no-store",
        });

        const data: unknown = await response.json();

        if (!response.ok || !Array.isArray(data)) {
          throw new Error(
            getMessage(data, "保管場所を取得できませんでした。")
          );
        }

        setLocations(data as Location[]);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "保管場所を取得できませんでした。"
        );
      } finally {
        setLoadingLocations(false);
      }
    };

    void loadLocations();
  }, [locations.length, open]);

  if (!open) {
    return null;
  }

  const update = (key: keyof typeof form, value: string) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setMessage("商品名を入力してください。");
      return;
    }

    if (!form.storageLocationId) {
      setMessage("保管場所を選択してください。");
      return;
    }

    const quantity = Number(form.quantity);

    if (!Number.isInteger(quantity) || quantity < 0) {
      setMessage("数量は0以上の整数で入力してください。");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/stocktake/register-item", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          ...form,
          quantity,
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getMessage(data, "未登録商品の保存に失敗しました。")
        );
      }

      onRegistered(data as RegisteredInventory);

      setForm({
        name: "",
        janCode: "",
        managementCode: "",
        manufacturer: "",
        majorCategory: "",
        minorCategory: "",
        unit: "個",
        storageLocationId: "",
        quantity: "0",
        lotNo: "",
        expirationDate: "",
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "未登録商品の保存に失敗しました。"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-4 sm:p-8">
      <section className="mx-auto my-4 w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-600">
              棚卸中の商品登録
            </p>

            <h2 className="mt-1 text-2xl font-bold">
              未登録商品を追加
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              登録後は、このまま棚卸対象へ追加されます。
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold"
          >
            閉じる
          </button>
        </div>

        {message && (
          <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {message}
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">商品名 *</span>

            <input
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="例：アレグラFX 56錠"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />
          </label>

          <label>
            <span className="text-sm font-bold">JANコード</span>

            <input
              value={form.janCode}
              onChange={(event) => update("janCode", event.target.value)}
              inputMode="numeric"
              placeholder="バーコード読取り値"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />
          </label>

          <label>
            <span className="text-sm font-bold">管理コード</span>

            <input
              value={form.managementCode}
              onChange={(event) =>
                update("managementCode", event.target.value)
              }
              placeholder="任意"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />
          </label>

          <label>
            <span className="text-sm font-bold">メーカー</span>

            <input
              value={form.manufacturer}
              onChange={(event) =>
                update("manufacturer", event.target.value)
              }
              placeholder="任意"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />
          </label>

          <label>
            <span className="text-sm font-bold">単位</span>

            <input
              value={form.unit}
              onChange={(event) => update("unit", event.target.value)}
              placeholder="個"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />
          </label>

          <label>
            <span className="text-sm font-bold">大分類</span>

            <input
              value={form.majorCategory}
              onChange={(event) =>
                update("majorCategory", event.target.value)
              }
              placeholder="任意"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />
          </label>

          <label>
            <span className="text-sm font-bold">小分類</span>

            <input
              value={form.minorCategory}
              onChange={(event) =>
                update("minorCategory", event.target.value)
              }
              placeholder="任意"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />
          </label>

          <label>
            <span className="text-sm font-bold">保管場所 *</span>

            <select
              value={form.storageLocationId}
              onChange={(event) =>
                update("storageLocationId", event.target.value)
              }
              disabled={loadingLocations}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-600"
            >
              <option value="">
                {loadingLocations
                  ? "保管場所を読み込み中..."
                  : "選択してください"}
              </option>

              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="text-sm font-bold">登録時の実在庫 *</span>

            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={form.quantity}
              onChange={(event) => update("quantity", event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />
          </label>

          <label>
            <span className="text-sm font-bold">ロット番号</span>

            <input
              value={form.lotNo}
              onChange={(event) => update("lotNo", event.target.value)}
              placeholder="任意"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />
          </label>

          <label>
            <span className="text-sm font-bold">使用期限</span>

            <input
              type="date"
              value={form.expirationDate}
              onChange={(event) =>
                update("expirationDate", event.target.value)
              }
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || loadingLocations}
          className="mt-7 w-full rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white disabled:bg-slate-400"
        >
          {saving ? "登録中..." : "商品を登録して棚卸へ追加"}
        </button>
      </section>
    </div>
  );
}