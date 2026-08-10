"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Location = {
  id: string;
  name: string;
};

type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
};

type FormState = {
  name: string;
  janCode: string;
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

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      `サーバーから応答を受け取れませんでした。（HTTP ${response.status}）`
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `サーバーから正しい応答を受け取れませんでした。（HTTP ${response.status}）`
    );
  }
}

export default function AddPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(initialForm);
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [loadingUser, setLoadingUser] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generateSystemJan, setGenerateSystemJan] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isAdmin = currentUser?.role === "ADMIN";
  const janIsEmpty = form.janCode.trim() === "";

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [locationResponse, userResponse] = await Promise.all([
          fetch("/api/storage-locations", {
            cache: "no-store",
          }),
          fetch("/api/auth/me", {
            cache: "no-store",
          }),
        ]);

        const [locationData, userData] = await Promise.all([
          readJson(locationResponse),
          readJson(userResponse),
        ]);

        if (!locationResponse.ok || !Array.isArray(locationData)) {
          throw new Error(
            getMessage(
              locationData,
              "保管場所一覧を取得できませんでした。"
            )
          );
        }

        if (!userResponse.ok) {
          throw new Error(
            getMessage(userData, "ログイン情報を取得できませんでした。")
          );
        }

        setLocations(locationData as Location[]);
        setCurrentUser(userData as CurrentUser);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "初期情報を取得できませんでした。"
        );
      } finally {
        setLoadingLocations(false);
        setLoadingUser(false);
      }
    };

    void loadInitialData();
  }, []);

  const change = (key: keyof FormState, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

    if (key === "janCode" && value.trim() !== "") {
      setGenerateSystemJan(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!form.name.trim()) {
      setError("商品名を入力してください。");
      return;
    }

    const quantity = Number(form.quantity);

    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("在庫数は0以上の整数で入力してください。");
      return;
    }

    if (janIsEmpty && !generateSystemJan) {
      setError(
        "JANコードを入力してください。JANがない商品は、管理者がシステムJANを発行して登録できます。"
      );
      return;
    }

    if (generateSystemJan && !isAdmin) {
      setError("システムJANの発行は管理者のみ実行できます。");
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
          generateSystemJan,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(data, "商品登録に失敗しました。")
        );
      }

      setMessage(
        getMessage(
          data,
          generateSystemJan
            ? "商品を登録し、システムJANを発行しました。"
            : "商品を登録しました。"
        )
      );

      setForm(initialForm);
      setGenerateSystemJan(false);

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
            className="rounded-xl bg-white px-4 py-3 text-center font-bold text-slate-700 shadow-sm hover:bg-slate-50"
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

        <form onSubmit={submit} className="space-y-5">
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
                  onChange={(event) => change("name", event.target.value)}
                  placeholder="例：救急絆創膏 Mサイズ 100枚入"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>

              <label>
                <span className="font-bold">
                  JANコード {!generateSystemJan && <span className="text-red-600">*</span>}
                </span>

                <input
                  value={form.janCode}
                  onChange={(event) => change("janCode", event.target.value)}
                  disabled={generateSystemJan}
                  inputMode="numeric"
                  placeholder="例：4901234567890"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 disabled:bg-slate-100"
                />

                <span className="mt-1 block text-xs text-slate-500">
                  パッケージに記載された既存JANを入力します。
                </span>
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-bold text-slate-800">JANがない商品の場合</p>

                {loadingUser ? (
                  <p className="mt-2 text-sm text-slate-500">
                    権限を確認しています…
                  </p>
                ) : isAdmin ? (
                  <>
                    <label className="mt-3 flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={generateSystemJan}
                        disabled={!janIsEmpty && !generateSystemJan}
                        onChange={(event) =>
                          setGenerateSystemJan(event.target.checked)
                        }
                        className="mt-1 h-5 w-5"
                      />

                      <span>
                        <span className="block font-bold text-blue-700">
                          システムJANを発行して登録
                        </span>
                        <span className="mt-1 block text-sm text-slate-600">
                          このシステム内の検索・カメラ読取・棚卸に使う管理用番号を発行します。
                        </span>
                      </span>
                    </label>

                    {!janIsEmpty && (
                      <p className="mt-2 text-xs font-bold text-slate-500">
                        既存JANが入力されているため、システムJANの発行は不要です。
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">
                    JANがない商品の登録は、管理者へ依頼してください。
                  </p>
                )}
              </div>

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
            <h2 className="text-xl font-black text-slate-900">分類</h2>

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
                  placeholder="例：救急絆創膏"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-black text-slate-900">初期在庫</h2>

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
                  在庫数 <span className="text-red-600">*</span>
                </span>

                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={form.quantity}
                  onChange={(event) => change("quantity", event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>

              <label>
                <span className="font-bold">単位</span>

                <input
                  value={form.unit}
                  onChange={(event) => change("unit", event.target.value)}
                  placeholder="例：個、箱"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
                />
              </label>

              <label>
                <span className="font-bold">ロット番号</span>

                <input
                  value={form.lotNo}
                  onChange={(event) => change("lotNo", event.target.value)}
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
            type="submit"
            disabled={saving || loadingUser}
            className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-400"
          >
            {saving
              ? "商品を登録中…"
              : generateSystemJan
                ? "商品を登録してシステムJANを発行する"
                : "商品と初期在庫を登録する"}
          </button>
        </form>
      </div>
    </main>
  );
}