"use client";

import { useEffect, useRef, useState } from "react";
import FeedbackToast from "@/components/common/FeedbackToast";

type Location = {
  id: string;
  name: string;
};

type RegisteredTarget = {
  id: string;
  expectedQuantity: number;
  isRecorded: boolean;
  countedQuantity: number | null;
  alreadyRegistered?: boolean;
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

type UnregisteredItemDialogProps = {
  open: boolean;
  sessionId: string;
  initialJanCode: string;
  onClose: () => void;
  onRegistered: (target: RegisteredTarget) => void;
};

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

function isSystemBarcode(value: string) {
  return value.trim().toUpperCase().startsWith("SYS-");
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
  const nameRef = useRef<HTMLInputElement | null>(null);
  const locationRef = useRef<HTMLSelectElement | null>(null);
  const quantityRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    name: "",
    janCode: "",
    systemBarcode: "",
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

    const barcode = initialJanCode.trim();

    setMessage("");
    setForm((previous) => ({
      ...previous,
      janCode: isSystemBarcode(barcode) ? "" : barcode,
      systemBarcode: isSystemBarcode(barcode) ? barcode : "",
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

  const close = () => {
    if (!saving) {
      setMessage("");
      onClose();
    }
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setMessage("商品名を入力してください。");
      window.requestAnimationFrame(() => nameRef.current?.focus());
      return;
    }

    if (!form.storageLocationId) {
      setMessage("保管場所を選択してください。");
      window.requestAnimationFrame(() => locationRef.current?.focus());
      return;
    }

    const quantity = Number(form.quantity);

    if (!Number.isInteger(quantity) || quantity < 0) {
      setMessage("在庫数は0以上の整数で入力してください。");
      window.requestAnimationFrame(() => quantityRef.current?.focus());
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

      if (
        !response.ok ||
        !data ||
        typeof data !== "object" ||
        !("target" in data)
      ) {
        throw new Error(
          getMessage(data, "未登録商品の登録に失敗しました。")
        );
      }

      onRegistered(data.target as RegisteredTarget);
      onClose();

      setForm({
        name: "",
        janCode: "",
        systemBarcode: "",
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
          : "未登録商品の登録に失敗しました。"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-4 sm:p-8">
      <FeedbackToast
        message={message}
        tone="error"
        title="商品登録エラー"
        onClose={() => setMessage("")}
      />
      <section className="mx-auto my-4 w-full max-w-2xl rounded-3xl bg-white p-5 text-slate-900 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-600">
              棚卸中の商品登録
            </p>

            <h2 className="mt-1 text-2xl font-bold">未登録商品を追加</h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              登録後は、今回の棚卸対象へ即時追加され、そのまま数量入力へ進みます。
            </p>
          </div>

          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold hover:bg-slate-200 disabled:opacity-50"
          >
            閉じる
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">
              商品名 <span className="text-red-600">*</span>
            </span>

            <input
              ref={nameRef}
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
              placeholder="JANがあれば入力"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />
          </label>

          <label>
            <span className="text-sm font-bold">システムバーコード</span>

            <input
              value={form.systemBarcode}
              onChange={(event) =>
                update("systemBarcode", event.target.value.toUpperCase())
              }
              placeholder="JANがなければ自動発行"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />

            <span className="mt-1 block text-xs text-slate-500">
              空欄なら、JANがない商品にだけ自動で発行します。
            </span>
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
              onChange={(event) => update("manufacturer", event.target.value)}
              placeholder="任意"
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
            <span className="text-sm font-bold">単位</span>

            <input
              value={form.unit}
              onChange={(event) => update("unit", event.target.value)}
              placeholder="個"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
            />
          </label>

          <label>
            <span className="text-sm font-bold">
              保管場所 <span className="text-red-600">*</span>
            </span>

            <select
              ref={locationRef}
              value={form.storageLocationId}
              onChange={(event) =>
                update("storageLocationId", event.target.value)
              }
              disabled={loadingLocations}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-600"
            >
              <option value="">
                {loadingLocations
                  ? "保管場所を読み込み中…"
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
            <span className="text-sm font-bold">
              登録時の在庫数 <span className="text-red-600">*</span>
            </span>

            <input
              ref={quantityRef}
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
          className="mt-7 w-full rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white hover:bg-blue-700 disabled:bg-slate-400"
        >
          {saving
            ? "登録中…"
            : "商品を登録して棚卸入力へ進む"}
        </button>
      </section>
    </div>
  );
}
