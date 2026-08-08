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

const menus = [
  {
    title: "棚卸開始",
    description: "新しい棚卸を開始・再開します",
    href: "/stocktake/start",
    icon: "📦",
    color: "bg-blue-500",
  },
  {
    title: "在庫検索",
    description: "JAN・商品名などで在庫を検索",
    href: "/inventory-search",
    icon: "🔎",
    color: "bg-green-500",
  },
  {
    title: "商品一覧",
    description: "登録済みの商品を確認します",
    href: "/items",
    icon: "📋",
    color: "bg-orange-500",
  },
  {
    title: "棚卸履歴",
    description: "過去の棚卸結果を確認します",
    href: "/stocktake/history",
    icon: "🕘",
    color: "bg-purple-500",
  },
];

export default function HomePage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/me");

        if (!response.ok) {
          router.replace("/login");
          return;
        }

        setUser(await response.json());
      } finally {
        setLoading(false);
      }
    };

    void loadUser();
  }, [router]);

  const logout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    router.replace("/login");
    router.refresh();
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100">
        <p className="font-bold text-slate-600">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-widest text-blue-600">
              INVENTORY OS
            </p>

            <h1 className="mt-1 text-3xl font-black text-slate-900 sm:text-4xl">
              在庫管理システム
            </h1>

            <p className="mt-2 text-slate-600">
              棚卸・検索・在庫管理
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-slate-500">ログイン中</p>
              <p className="font-black text-slate-900">
                {user?.displayName ?? "-"}
                {user?.role === "ADMIN" && (
                  <span className="ml-2 rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                    管理者
                  </span>
                )}
              </p>
            </div>

            {user?.role === "ADMIN" && (
              <Link
                href="/admin/users"
                className="rounded-xl bg-slate-700 px-4 py-3 font-bold text-white transition hover:bg-slate-800"
              >
                ユーザー管理
              </Link>
            )}

            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl bg-white px-4 py-3 font-bold text-slate-700 shadow-sm transition hover:bg-slate-200"
            >
              ログアウト
            </button>
          </div>
        </header>

        <section className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {menus.map((menu) => (
            <Link key={menu.href} href={menu.href}>
              <article className="h-full rounded-2xl bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                <div
                  className={`${menu.color} flex h-14 w-14 items-center justify-center rounded-xl text-3xl`}
                >
                  {menu.icon}
                </div>

                <h2 className="mt-5 text-xl font-black text-slate-900">
                  {menu.title}
                </h2>

                <p className="mt-2 text-slate-600">{menu.description}</p>
              </article>
            </Link>
          ))}
        </section>

        <section className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="font-bold text-slate-500">登録商品数</p>
            <p className="mt-3 text-4xl font-black text-slate-900">--</p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="font-bold text-slate-500">進行中棚卸</p>
            <p className="mt-3 text-4xl font-black text-slate-900">--</p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="font-bold text-slate-500">今日の棚卸</p>
            <p className="mt-3 text-4xl font-black text-slate-900">--</p>
          </div>
        </section>
      </div>
    </main>
  );
}