"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Location = {
  id: string;
  name: string;
};

type FormState = {
  name: string;
  janCode: string;
  systemBarcode: string;
  managementCode: string;
  managementGroupCode: string;
  manufacturer: string;
  majorCategory: string;
  minorCategory: string;
  storageLocationId: string;
  lotNo: string;
  expirationDate: string;
  unit: string;
  quantity: string;
};

const initialForm: FormState = {
  name: "",
  janCode: "",
  systemBarcode: "",
  managementCode: "",
  managementGroupCode: "",
  manufacturer: "",
  majorCategory: "",
  minorCategory: "",
  storageLocationId: "",
  lotNo: "",
  expirationDate: "",
  unit: "個",
  quantity: "0",
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

export default function AddPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(initialForm);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "保管場所を取得できませんでした。"
      );
    } finally {
      setLoadingLocations(false);
    }
  };

  useEffect(() => {
    void loadLocations();
  }, []);

  const change = (
    key: keyof FormState,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const submit = async () => {
    setMessage("");
    setError("");

    if (!form.name.trim()) {
      setError("商品名を入力してください。");
      return;
    }

    const quantity = Number(form.quantity);

    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("初期在庫は0以上の整数で入力してください。");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/items/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          quantity,
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getMessage(data, "商品登録に失敗しました。")
        );
      }

      setMessage(
        "商品を登録しました。システムバーコードも自動発行されています。"
      );

      setForm(initialForm);

      window.setTimeout(() => {
        router.push("/items");
      }, 1200);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "商品登録に失敗しました。"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-widest text-blue-600">
              INVENTORY OS
            </p>

            <h1 className="mt-1 text-3xl font-black text-slate-900">
              商品登録
            </h1>

            <p className="mt-2 text-slate-600">
              商品情報と初期在庫をまとめて登録します。
            </p>
          </div>

          <Link
            href="/"
            className="rounded-xl bg-white px-4 py-3 text-center font-bold text-slate-700 shadow-sm"
          >
            ホームへ戻る
          </Link>
        </header>

        {error && (
          <section className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="text-sm font-bold text-red-600">
              商品登録エラー
            </p>

            <p className="mt-2 text-slate-700">{error}</p>
          </section>
        )}

        {message && (
          <section className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="font-bold text-emerald-700">{message}</p>
            <p className="mt-1 text-sm text-emerald-700">
              商品一覧へ移動します。
            </p>
          </section>
        )}

        <div className="space-y-5">
          <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-black text-slate-900">
              基本情報
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="font-bold">
                  商品名 <span className="text-red-600">*</span>
                </span>

                <input
                  value={form.name}
                  onChange={(event) =>
                    change("name", event.target.value)
                  }
                  placeholder="例：救急絆創膏 Mサイズ 100枚入"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>

              <label>
                <span className="font-bold">JANコード</span>

                <input
                  value={form.janCode}
                  onChange={(event) =>
                    change("janCode", event.target.value)
                  }
                  inputMode="numeric"
                  placeholder="例：4901234567890"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>

              <label>
                <span className="font-bold">
                  システムバーコード
                </span>

                <input
                  value={form.systemBarcode}
                  onChange={(event) =>
                    change("systemBarcode", event.target.value)
                  }
                  placeholder="空欄なら自動発行"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />

                <span className="mt-1 block text-xs text-slate-500">
                  JANがない商品でも、空欄のまま登録すれば自動発行します。
                </span>
              </label>

              <label>
                <span className="font-bold">管理コード</span>

                <input
                  value={form.managementCode}
                  onChange={(event) =>
                    change("managementCode", event.target.value)
                  }
                  placeholder="任意"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>

              <label>
                <span className="font-bold">管理グループコード</span>

                <input
                  value={form.managementGroupCode}
                  onChange={(event) =>
                    change("managementGroupCode", event.target.value)
                  }
                  placeholder="任意"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>

              <label>
                <span className="font-bold">メーカー</span>

                <input
                  value={form.manufacturer}
                  onChange={(event) =>
                    change("manufacturer", event.target.value)
                  }
                  placeholder="例：オレンジケア"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-black text-slate-900">
              分類
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="font-bold">大分類</span>

                <input
                  value={form.majorCategory}
                  onChange={(event) =>
                    change("majorCategory", event.target.value)
                  }
                  placeholder="例：衛生用品"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>

              <label>
                <span className="font-bold">小分類</span>

                <input
                  value={form.minorCategory}
                  onChange={(event) =>
                    change("minorCategory", event.target.value)
                  }
                  placeholder="例：絆創膏"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-black text-slate-900">
              初期在庫
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="font-bold">保管場所</span>

                <select
                  value={form.storageLocationId}
                  disabled={loadingLocations}
                  onChange={(event) =>
                    change("storageLocationId", event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-600 disabled:bg-slate-100"
                >
                  <option value="">未設定</option>

                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="font-bold">
                  初期在庫 <span className="text-red-600">*</span>
                </span>

                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={form.quantity}
                  onChange={(event) =>
                    change("quantity", event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>

              <label>
                <span className="font-bold">単位</span>

                <input
                  value={form.unit}
                  onChange={(event) =>
                    change("unit", event.target.value)
                  }
                  placeholder="例：個、箱、枚"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>

              <label>
                <span className="font-bold">ロット番号</span>

                <input
                  value={form.lotNo}
                  onChange={(event) =>
                    change("lotNo", event.target.value)
                  }
                  placeholder="任意"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>

              <label className="sm:col-span-2">
                <span className="font-bold">使用期限</span>

                <input
                  type="date"
                  value={form.expirationDate}
                  onChange={(event) =>
                    change("expirationDate", event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>
            </div>
          </section>

          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-400"
          >
            {saving ? "商品を登録中…" : "商品と初期在庫を登録する"}
          </button>
        </div>
      </div>
    </main>
  );
}