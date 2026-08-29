"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FeatureKey } from "@/lib/feature-permissions";

type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
  featurePermissions: FeatureKey[];
};

type ApiError = {
  code?: string;
  message?: string;
};

type NotificationResponse = {
  unreadCount: number;
};

type Menu = {
  href: string;
  icon: string;
  title: string;
  description: string;
  color: string;
  feature?: FeatureKey;
  adminOnly?: boolean;
};

const workerMenus: Menu[] = [
  {
    href: "/stocktake/start",
    icon: "📦",
    title: "棚卸開始",
    description: "新しい棚卸の開始、中断している棚卸の再開を行います。",
    color: "bg-blue-500",
    feature: "STOCKTAKE",
  },
  {
    href: "/marketplace",
    icon: "🛍️",
    title: "フリマ販売",
    description: "出品、価格・送料・利益、販売先設定をまとめて管理します。",
    color: "bg-violet-600",
  },
  {
    href: "/items",
    icon: "🔎",
    title: "商品・在庫検索",
    description: "商品情報、在庫数、保管場所、ロットをまとめて検索・印刷します。",
    color: "bg-emerald-500",
    feature: "CATALOG",
  },
  {
    href: "/stocktake/history",
    icon: "🕘",
    title: "棚卸履歴",
    description: "自分が実施した棚卸と、その結果を確認します。",
    color: "bg-cyan-500",
    feature: "STOCKTAKE_HISTORY",
  },
];

const adminMenus: Menu[] = [
  {
    href: "/admin",
    icon: "⚙️",
    title: "管理者設定",
    description: "ユーザー、商品・在庫、エラー、棚卸全体を管理します。",
    color: "bg-slate-800",
  },
  {
    href: "/admin/stocktake",
    icon: "📊",
    title: "全棚卸管理",
    description: "全担当者の棚卸進捗、中断、差異、競合を横断して確認します。",
    color: "bg-indigo-600",
  },
];

function isCurrentUser(value: unknown): value is CurrentUser {
  return (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    "username" in value &&
    "displayName" in value &&
    "role" in value &&
    "featurePermissions" in value &&
    typeof (value as CurrentUser).id === "string" &&
    typeof (value as CurrentUser).username === "string" &&
    typeof (value as CurrentUser).displayName === "string" &&
    Array.isArray((value as CurrentUser).featurePermissions) &&
    ((value as CurrentUser).role === "ADMIN" ||
      (value as CurrentUser).role === "WORKER")
  );
}

function isNotificationResponse(
  value: unknown
): value is NotificationResponse {
  return (
    value !== null &&
    typeof value === "object" &&
    "unreadCount" in value &&
    typeof (value as NotificationResponse).unreadCount === "number"
  );
}

function getMessage(value: unknown, fallback: string) {
  if (
    value !== null &&
    typeof value === "object" &&
    "message" in value &&
    typeof (value as ApiError).message === "string"
  ) {
    return (value as ApiError).message ?? fallback;
  }

  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(`サーバー応答が空です。HTTP ${response.status}`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `サーバー応答を読み取れませんでした。HTTP ${response.status}`
    );
  }
}

export default function HomePage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const authResponse = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        const authData = await readJson(authResponse);

        if (authResponse.status === 401) {
          router.replace("/login");
          return;
        }

        if (!authResponse.ok || !isCurrentUser(authData)) {
          throw new Error(
            getMessage(authData, "ログイン情報を確認できませんでした。")
          );
        }

        if (cancelled) return;

        setUser(authData);

        try {
          const notificationResponse = await fetch("/api/notifications", {
            cache: "no-store",
          });

          if (!notificationResponse.ok) return;

          const notificationData = await readJson(notificationResponse);

          if (!cancelled && isNotificationResponse(notificationData)) {
            setUnreadCount(notificationData.unreadCount);
          }
        } catch {
          // 通知の取得失敗はホーム画面自体を止めない
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "ホーム画面の準備に失敗しました。"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-6">
        <p className="font-bold text-slate-600">システムを準備しています…</p>
      </main>
    );
  }

  if (error || !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-5">
        <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-black text-red-600">
            HOME_AUTH_ERROR
          </p>

          <h1 className="mt-1 text-2xl font-black">
            ホーム画面を開けませんでした
          </h1>

          <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-800">
            {error || "ログイン情報を確認できませんでした。"}
          </p>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"
            >
              再試行
            </button>

            <Link
              href="/login"
              className="rounded-xl bg-slate-700 px-4 py-3 font-bold text-white"
            >
              ログインへ
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const menus =
    user.role === "ADMIN"
      ? [...workerMenus, ...adminMenus]
      : workerMenus.filter(
          (menu) =>
            !menu.adminOnly &&
            (!menu.feature || user.featurePermissions.includes(menu.feature))
        );

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black tracking-[0.2em] text-blue-600">
              INVENTORY OS
            </p>

            <h1 className="mt-1 text-3xl font-black sm:text-4xl">
              在庫管理システム
            </h1>

            <p className="mt-2 text-slate-600">
              棚卸・検索・商品・在庫管理
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/notifications"
              className="relative rounded-xl bg-white px-4 py-3 font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              🔔 通知
              {unreadCount > 0 && (
                <span className="ml-2 rounded-full bg-red-600 px-2 py-1 text-xs text-white">
                  {unreadCount}
                </span>
              )}
            </Link>

            <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-slate-500">
                ログイン中
              </p>

              <p className="font-black">
                {user.displayName}

                {user.role === "ADMIN" && (
                  <span className="ml-2 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">
                    管理者
                  </span>
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl bg-slate-800 px-4 py-3 font-bold text-white transition hover:bg-slate-700"
            >
              ログアウト
            </button>
          </div>
        </header>

        {user.role === "ADMIN" && (
          <section className="mt-7 rounded-3xl border border-indigo-200 bg-indigo-50 p-5">
            <p className="text-sm font-black text-indigo-700">
              管理者モード
            </p>

            <h2 className="mt-1 text-xl font-black text-indigo-950">
              全体の棚卸・商品・ユーザーを管理できます
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-indigo-900">
              日常の棚卸は通常メニューから行います。全担当者の棚卸確認、商品マスタ変更、ユーザー管理、エラー対応は管理者メニューから行ってください。
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/admin/stocktake"
                className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white"
              >
                全棚卸管理を開く
              </Link>

              <Link
                href="/admin"
                className="rounded-xl bg-white px-4 py-3 font-bold text-indigo-800 shadow-sm"
              >
                管理者設定を開く
              </Link>
            </div>
          </section>
        )}

        <section className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {menus.map((menu) => (
            <Link key={menu.href} href={menu.href} className="group">
              <article className="h-full rounded-3xl bg-white p-6 shadow-sm transition duration-200 group-hover:-translate-y-1 group-hover:shadow-lg">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl text-3xl text-white ${menu.color}`}
                >
                  {menu.icon}
                </div>

                <h2 className="mt-5 text-xl font-black">{menu.title}</h2>

                <p className="mt-2 leading-6 text-slate-600">
                  {menu.description}
                </p>

                <p className="mt-5 text-sm font-bold text-blue-600">
                  開く →
                </p>
              </article>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
