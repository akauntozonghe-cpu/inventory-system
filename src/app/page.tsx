"use client";

import Link from "next/link";
import ContinueStocktake from "@/components/dashboard/ContinueStocktake";
import { fetchFresh } from "@/lib/fetch-fresh";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FeatureKey } from "@/lib/feature-permissions";
import { ArrowUpRight, BarChart3, Bell, Boxes, CalendarClock, History, LogOut, ScanLine, Search, Settings2, Store, type LucideIcon } from "lucide-react";

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
  icon: LucideIcon;
  title: string;
  description: string;
  accent: string;
  feature?: FeatureKey;
};

const workerMenus: Menu[] = [
  {
    href: "/stocktake/start",
    icon: ScanLine,
    title: "棚卸開始",
    description: "新しい棚卸の開始、中断している棚卸の再開を行います。",
    accent: "from-teal-500 to-cyan-500",
    feature: "STOCKTAKE",
  },
  {
    href: "/marketplace",
    icon: Store,
    title: "フリマ販売",
    description: "出品、価格・送料・利益、販売先設定をまとめて管理します。",
    accent: "from-violet-500 to-indigo-500",
  },
  {
    href: "/expiry",
    icon: CalendarClock,
    title: "期限管理",
    description: "期限切れ・期限接近・確認済み・対応記録を優先順に管理します。",
    accent: "from-orange-500 to-amber-400",
    feature: "CATALOG",
  },
  {
    href: "/items",
    icon: Search,
    title: "商品・在庫検索",
    description: "商品情報、在庫数、保管場所、ロットをまとめて検索・印刷します。",
    accent: "from-emerald-500 to-teal-500",
    feature: "CATALOG",
  },
  {
    href: "/stocktake/history",
    icon: History,
    title: "棚卸履歴",
    description: "自分が実施した棚卸と、その結果を確認します。",
    accent: "from-sky-500 to-blue-500",
    feature: "STOCKTAKE_HISTORY",
  },
];

const adminMenus: Menu[] = [
  {
    href: "/admin",
    icon: Settings2,
    title: "管理者設定",
    description: "ユーザー、商品・在庫、エラー、棚卸全体を管理します。",
    accent: "from-slate-700 to-slate-900",
  },
  {
    href: "/admin/stocktake",
    icon: BarChart3,
    title: "全棚卸管理",
    description: "全担当者の棚卸進捗、中断、差異、競合を横断して確認します。",
    accent: "from-indigo-500 to-blue-600",
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

        const authResponse = await fetchFresh("/api/auth/me", {
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
        setLoading(false);

        try {
          const notificationResponse = await fetchFresh("/api/notifications", {
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

  const visibleWorkerMenus = workerMenus.filter(
    (menu) =>
      user.role === "ADMIN" ||
      !menu.feature ||
      user.featurePermissions.includes(menu.feature)
  );
  const menus =
    user.role === "ADMIN"
      ? [...visibleWorkerMenus, ...adminMenus]
      : visibleWorkerMenus;

  return (
    <main className="min-h-screen bg-[#f4f6f8] p-3 text-slate-950 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="relative overflow-hidden rounded-[2rem] bg-[#0b1220] p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,.16)] sm:p-8">
          <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-teal-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-7 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-teal-400 text-slate-950 shadow-[0_10px_30px_rgba(45,212,191,.25)]"><Boxes size={26} strokeWidth={2.4} /></div>
            <p className="text-xs font-bold tracking-[0.22em] text-teal-300">
              INVENTORY OS
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              おかえりなさい、{user.displayName}さん
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              棚卸、期限、販売まで。今日必要な作業をここから始められます。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              aria-label="通知を開く"
              className="relative grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ring-2 ring-[#0b1220]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>

            <button
              type="button"
              onClick={() => void logout()}
              aria-label="ログアウト"
              className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
            >
              <LogOut size={20} />
            </button>
          </div>
          </div>
        </header>

        {(user.role === "ADMIN" || user.featurePermissions.includes("STOCKTAKE")) && <ContinueStocktake />}

        <div className="mb-4 mt-8 flex items-end justify-between px-1"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">Workspace</p><h2 className="mt-1 text-xl font-black tracking-tight">機能を選ぶ</h2></div><p className="hidden text-sm text-slate-500 sm:block">よく使う順に配置しています</p></div>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {menus.map((menu, index) => {
            const Icon = menu.icon;
            const primary = index === 0;
            return <Link key={menu.href} href={menu.href} className={`group relative overflow-hidden rounded-[1.5rem] border p-5 transition duration-200 focus-visible:outline-none ${primary ? "border-teal-200 bg-teal-50 sm:col-span-2 xl:col-span-1" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <div className="flex items-start gap-4">
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-sm ${menu.accent}`}><Icon size={23} strokeWidth={2.25} /></div>
                <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-black tracking-tight">{menu.title}</h3><ArrowUpRight size={19} className="text-slate-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-800" /></div><p className="mt-1.5 text-sm leading-6 text-slate-600">{menu.description}</p></div>
              </div>
            </Link>;
          })}
        </section>
      </div>
    </main>
  );
}
