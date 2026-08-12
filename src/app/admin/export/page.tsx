"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
};

type ExportItem = {
  type: "inventory" | "items" | "stocktake" | "audit";
  icon: string;
  title: string;
  description: string;
  filename: string;
};

const exportItems: ExportItem[] = [
  {
    type: "inventory",
    icon: "📦",
    title: "在庫バックアップ",
    description: "現在の在庫数、保管場所、商品情報をCSVで保存します。",
    filename: "inventory-backup.csv",
  },
  {
    type: "items",
    icon: "🏷️",
    title: "商品マスターバックアップ",
    description: "JAN・システムバーコード・分類などの商品情報を保存します。",
    filename: "item-master-backup.csv",
  },
  {
    type: "stocktake",
    icon: "📋",
    title: "棚卸履歴バックアップ",
    description: "棚卸の状態、担当者、対象件数、実施日時を保存します。",
    filename: "stocktake-history-backup.csv",
  },
  {
    type: "audit",
    icon: "🛡️",
    title: "監査ログバックアップ",
    description: "管理者による重要操作の履歴を保存します。",
    filename: "admin-audit-backup.csv",
  },
];

function isCurrentUser(value: unknown): value is CurrentUser {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.username === "string" &&
    typeof candidate.displayName === "string" &&
    (candidate.role === "ADMIN" || candidate.role === "WORKER")
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function getMessage(value: unknown, fallback: string) {
  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }

  return fallback;
}

function getUserFromResponse(value: unknown): CurrentUser | null {
  if (isCurrentUser(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "user" in value &&
    isCurrentUser(value.user)
  ) {
    return value.user;
  }

  if (
    value &&
    typeof value === "object" &&
    "currentUser" in value &&
    isCurrentUser(value.currentUser)
  ) {
    return value.currentUser;
  }

  return null;
}

export default function AdminExportPage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        const data = await readJson(response);

        if (response.status === 401) {
          router.replace("/login?next=/admin/export");
          return;
        }

        const currentUser = getUserFromResponse(data);

        if (!response.ok || !currentUser) {
          throw new Error(
            getMessage(data, "ログイン情報を取得できませんでした。")
          );
        }

        if (currentUser.role !== "ADMIN") {
          router.replace("/");
          return;
        }

        if (!cancelled) {
          setUser(currentUser);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "ログイン情報を取得できませんでした。"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function downloadCsv(item: ExportItem) {
    setError("");
    setMessage("");
    setDownloading(item.type);

    window.location.assign(
      `/api/admin/export?type=${encodeURIComponent(item.type)}`
    );

    window.setTimeout(() => {
      setDownloading(null);
      setMessage(
        `「${item.filename}」のダウンロードを開始しました。保存先を確認してください。`
      );
    }, 800);
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-5">
        <p className="font-bold text-slate-600">
          管理者情報を確認しています…
        </p>
      </main>
    );
  }

  if (error || !user) {
    return (
      <main className="min-h-screen bg-slate-100 p-5 text-slate-900">
        <section className="mx-auto mt-16 w-full max-w-xl rounded-3xl bg-white p-7 shadow-sm">
          <p className="font-black text-red-600">
            {error || "ログイン情報を取得できませんでした。"}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700"
            >
              再読み込み
            </button>

            <Link
              href="/"
              className="rounded-xl bg-slate-800 px-5 py-3 font-bold text-white hover:bg-slate-700"
            >
              ホームへ戻る
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black text-indigo-600">管理者設定</p>

            <h1 className="mt-1 text-3xl font-black sm:text-4xl">
              バックアップ・CSV出力
            </h1>

            <p className="mt-3 text-slate-600">
              データを端末へ保存できます。出力操作は監査ログへ記録されます。
            </p>
          </div>

          <Link
            href="/admin"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-700 px-5 font-bold text-white hover:bg-slate-800"
          >
            管理者メニューへ戻る
          </Link>
        </header>

        <section className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <p className="font-bold text-blue-900">
            ログイン中：{user.displayName}
          </p>

          <p className="mt-2 text-sm leading-6 text-blue-800">
            定期的に在庫・商品・棚卸履歴を保存しておくと、操作ミスや端末故障時の確認・復旧に役立ちます。
          </p>
        </section>

        {message && (
          <div
            role="status"
            className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-800"
          >
            {message}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {exportItems.map((item) => {
            const isDownloading = downloading === item.type;

            return (
              <section
                key={item.type}
                className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-3xl">
                    {item.icon}
                  </div>

                  <div>
                    <h2 className="text-xl font-black">{item.title}</h2>

                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {item.description}
                    </p>
                  </div>
                </div>

                <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  保存ファイル：{item.filename}
                </p>

                <button
                  type="button"
                  onClick={() => downloadCsv(item)}
                  disabled={downloading !== null}
                  className="mt-5 min-h-12 w-full rounded-xl bg-indigo-600 px-5 font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isDownloading
                    ? "ダウンロードを開始しています…"
                    : "CSVをダウンロード"}
                </button>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}