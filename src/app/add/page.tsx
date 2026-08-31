"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FeedbackToast from "@/components/common/FeedbackToast";

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
  memo: string;
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
  memo: "",
};

function getMessage(data: unknown, fallback: string) {
  if (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    const code = "code" in data && typeof data.code === "string" ? data.code : "";
    return code ? `${data.message}（エラーコード：${code}）` : data.message;
  }

  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      `サーバーから応答を受け取れませんでした。HTTP ${response.status}`
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `サーバーから正しい応答を受け取れませんでした。HTTP ${response.status}`
    );
  }
}

function isCurrentUser(value: unknown): value is CurrentUser {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "username" in value &&
    "displayName" in value &&
    "role" in value &&
    typeof value.id === "string" &&
    typeof value.username === "string" &&
    typeof value.displayName === "string" &&
    (value.role === "ADMIN" || value.role === "WORKER")
  );
}

export default function AddPage() {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement | null>(null);
  const quantityRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<FormState>(initialForm);
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generateSystemBarcode, setGenerateSystemBarcode] = useState(false);\n  const [expirationHasDay, setExpirationHasDay] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isAdmin = currentUser?.role === "ADMIN";
  const hasJanCode = form.janCode.trim().length > 0;

  const showValidationError = (
    text: string,
    target?: HTMLInputElement | null
  ) => {
    setError(text);
    window.requestAnimationFrame(() => {
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus();
    });
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [locationResponse, userResponse] = await Promise.all([
          fetch("/api/storage-locations", { cache: "no-store" }),
          fetch("/api/auth/me", { cache: "no-store" }),
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

        if (!userResponse.ok || !isCurrentUser(userData)) {
          throw new Error(
            getMessage(
              userData,
              "ログイン情報を取得できませんでした。もう一度ログインしてください。"
            )
          );
        }

        setLocations(locationData as Location[]);
        setCurrentUser(userData);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "初期データの取得に失敗しました。"
        );
      } finally {
        setLoading(false);
      }
    };

    void loadInitialData();
  }, []);

  const change = (key: keyof FormState, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

    if (key === "janCode" && value.trim()) {
      setGenerateSystemBarcode(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");
    setMessage("");

    const name = form.name.trim();
    const quantity = Number(form.quantity);

    if (!name) {
      showValidationError("商品名を入力してください。", nameRef.current);
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      showValidationError(
        "数量は0以上の整数で入力してください。",
        quantityRef.current
      );
      return;
    }

    if (generateSystemBarcode && !isAdmin) {
      setError("システムバーコードの発行は管理者のみ実行できます。");
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
          generateSystemBarcode,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(data, "商品登録に失敗しました。")
        );
      }

      const fallbackMessage = isAdmin
        ? generateSystemBarcode
          ? "商品を正式登録し、システムバーコードを発行しました。"
          : "商品と在庫を正式登録しました。"
        : "商品登録を申請しました。管理者の確認後に正式登録されます。";

      setMessage(getMessage(data, fallbackMessage));
      setForm(initialForm);
      setGenerateSystemBarcode(false);

      window.setTimeout(() => {
        router.push(isAdmin ? "/items" : "/");
      }, 1400);
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
      <FeedbackToast
        message={error}
        tone="error"
        title="商品登録エラー"
        onClose={() => setError("")}
      />
      <FeedbackToast
        message={message}
        tone="success"
        title="登録しました"
        onClose={() => setMessage("")}
      />
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black tracking-widest text-blue-600">
              INVENTORY OS
            </p>

            <h1 className="mt-1 text-3xl font-black text-slate-900">
              商品・在庫登録
            </h1>

            <p className="mt-2 text-slate-600">
              {isAdmin
                ? "管理者登録：商品と初期在庫をその場で正式登録します。"
                : "一般ユーザー登録：内容は管理者確認後に正式登録されます。"}
            </p>
          </div>

          <Link
            href="/"
            className="rounded-xl bg-slate-700 px-5 py-3 text-center font-bold text-white transition hover:bg-slate-800"
          >
            ホームへ戻る
          </Link>
        </header>

        {!loading && currentUser && (
          <section
            className={`mb-5 rounded-2xl border p-5 ${
              isAdmin
                ? "border-blue-200 bg-blue-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <p className="font-black text-slate-900">
              ログイン中：{currentUser.displayName}
            </p>

            <p className="mt-1 text-sm text-slate-700">
              {isAdmin
                ? "管理者として正式登録できます。登録内容は操作ログに記録されます。"
                : "登録内容は申請として保存され、管理者が確認・承認します。"}
            </p>
          </section>
        )}

        <form onSubmit={submit} className="space-y-5">
          <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-black text-slate-900">
              商品情報
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="font-bold text-slate-800">
                  商品名 <span className="text-red-600">*</span>
                </span>

                <input
                  ref={nameRef}
                  value={form.name}
                  onChange={(event) => change("name", event.target.value)}
                  placeholder="例：救急絆創膏 Mサイズ 100枚入"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label>
                <span className="font-bold text-slate-800">
                  JANコード
                </span>

                <input
                  value={form.janCode}
                  onChange={(event) =>
                    change("janCode", event.target.value)
                  }
                  disabled={generateSystemBarcode}
                  inputMode="numeric"
                  placeholder="例：4901234567890"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                />

                <span className="mt-1 block text-xs text-slate-500">
                  商品に印字されているJANコードを優先して入力します。
                </span>
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-bold text-slate-800">
                  JANコードがない商品
                </p>

                {isAdmin ? (
                  <>
                    <label className="mt-3 flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={generateSystemBarcode}
                        disabled={hasJanCode && !generateSystemBarcode}
                        onChange={(event) =>
                          setGenerateSystemBarcode(event.target.checked)
                        }
                        className="mt-1 h-5 w-5"
                      />

                      <span>
                        <span className="block font-bold text-blue-700">
                          システムバーコードを発行する
                        </span>

                        <span className="mt-1 block text-sm text-slate-600">
                          JANがない商品へ、システム内専用のバーコードを発行します。
                        </span>
                      </span>
                    </label>

                    {hasJanCode && (
                      <p className="mt-2 text-xs font-bold text-slate-500">
                        JANコードがある商品にはシステムバーコードを発行しません。
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">
                    JANが確認できない場合も、そのまま申請できます。管理者が確認時にシステムバーコードを発行できます。
                  </p>
                )}
              </div>

              <label>
                <span className="font-bold text-slate-800">
                  管理番号
                </span>

                <input
                  value={form.managementCode}
                  onChange={(event) =>
                    change("managementCode", event.target.value)
                  }
                  placeholder="任意"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label>
                <span className="font-bold text-slate-800">
                  管理グループコード
                </span>

                <input
                  value={form.managementGroupCode}
                  onChange={(event) =>
                    change("managementGroupCode", event.target.value)
                  }
                  placeholder="任意"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="sm:col-span-2">
                <span className="font-bold text-slate-800">
                  メーカー
                </span>

                <input
                  value={form.manufacturer}
                  onChange={(event) =>
                    change("manufacturer", event.target.value)
                  }
                  placeholder="例：オレンジケア"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
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
                <span className="font-bold text-slate-800">
                  大分類
                </span>

                <input
                  value={form.majorCategory}
                  onChange={(event) =>
                    change("majorCategory", event.target.value)
                  }
                  placeholder="例：衛生用品"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label>
                <span className="font-bold text-slate-800">
                  小分類
                </span>

                <input
                  value={form.minorCategory}
                  onChange={(event) =>
                    change("minorCategory", event.target.value)
                  }
                  placeholder="例：絆創膏"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
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
                <span className="font-bold text-slate-800">
                  保管場所
                </span>

                <select
                  value={form.storageLocationId}
                  disabled={loading}
                  onChange={(event) =>
                    change("storageLocationId", event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
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
                <span className="font-bold text-slate-800">
                  数量 <span className="text-red-600">*</span>
                </span>

                <input
                  ref={quantityRef}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={form.quantity}
                  onChange={(event) =>
                    change("quantity", event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label>
                <span className="font-bold text-slate-800">
                  単位
                </span>

                <input
                  value={form.unit}
                  onChange={(event) => change("unit", event.target.value)}
                  placeholder="例：個、箱"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label>
                <span className="font-bold text-slate-800">
                  ロット番号
                </span>

                <input
                  value={form.lotNo}
                  onChange={(event) => change("lotNo", event.target.value)}
                  placeholder="任意"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="sm:col-span-2">
                <span className="font-bold text-slate-800">
                  使用期限（年月のみ・年月日の両方に対応）
                </span>

                <label className="mt-2 flex items-center gap-2 font-bold"><input type="checkbox" checked={expirationHasDay} onChange={(event) => { setExpirationHasDay(event.target.checked); change("expirationDate", ""); }} className="h-5 w-5" />日付まで記載されている</label>
                <input type={expirationHasDay ? "date" : "month"} value={form.expirationDate} onChange={(event) => change("expirationDate", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
                <span className="mt-2 block text-sm font-bold text-blue-800">登録値：{form.expirationDate || "未入力（期限データなしエラーになります）"}</span>
              </label>

              <label className="sm:col-span-2">
                <span className="font-bold text-slate-800">
                  メモ
                </span>

                <textarea
                  rows={3}
                  value={form.memo}
                  onChange={(event) => change("memo", event.target.value)}
                  placeholder="申請理由、商品の補足、保管上の注意など"
                  className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>
          </section>

          <button
            type="submit"
            disabled={saving || loading || !currentUser}
            className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-400"
          >
            {saving
              ? "送信中..."
              : isAdmin
                ? generateSystemBarcode
                  ? "正式登録してシステムバーコードを発行"
                  : "商品と初期在庫を正式登録"
                : "商品登録を申請する"}
          </button>
        </form>
      </div>
    </main>
  );
}


