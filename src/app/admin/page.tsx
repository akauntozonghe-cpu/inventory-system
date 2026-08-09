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
    href: "/admin/users",
    icon: "👥",
    title: "ユーザー管理",
    description: "ユーザー登録・停止・パスワード再発行を行います。",
    color: "bg-blue-500",
  },
  {
    href: "/admin/error-reports",
    icon: "🛡️",
    title: "エラー報告・復旧",
    description: "自動復旧できなかったエラーを確認・対応します。",
    color: "bg-red-500",
  },
  {
    href: "/add",
    icon: "➕",
    title: "商品登録",
    description: "商品・システムバーコード・初期在庫を登録します。",
    color: "bg-emerald-500",
  },
  {
    href: "/items",
    icon: "📋",
    title: "商品・在庫管理",
    description: "登録済みの商品情報と在庫を確認・編集します。",
    color: "bg-orange-500",
  },
  {
    href: "/locations",
    icon: "📍",
    title: "保管場所管理",
    description: "棚・倉庫など、保管場所を管理します。",
    color: "bg-purple-500",
  },
  {
    href: "/stocktake/history",
    icon: "🕘",
    title: "棚卸履歴",
    description: "確定済みの棚卸結果を確認します。",
    color: "bg-cyan-500",
  },
  {
    href: "/account/password",
    icon: "🔐",
    title: "自分のパスワード変更",
    description: "現在ログインしている管理者のパスワードを変更します。",
    color: "bg-slate-600",
  },
  {
    href: "/reset",
    icon: "⚠️",
    title: "データ初期化",
    description: "テストデータなどを初期化します。操作には十分注意してください。",
    color: "bg-rose-600",
  },
];

export default function AdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok) {
          throw new Error("ログイン情報を取得できませんでした。");
        }

        const currentUser = (await response.json()) as CurrentUser;

        if (currentUser.role !== "ADMIN") {
          router.replace("/");
          return;
        }

        setUser(currentUser);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "管理者情報を取得できませんでした。"
        );
      } finally {
        setLoading(false);
      }
    };

    void loadUser();
  }, [router]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100">
        <p className="font-bold text-slate-600">
          管理者情報を確認中…
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-5">
        <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-red-600">
            管理者モードを開始できません
          </p>

          <p className="mt-3 text-slate-700">{error}</p>

          <Link
            href="/"
            className="mt-6 block rounded-xl bg-slate-800 px-4 py-3 text-center font-bold text-white"
          >
            ホームへ戻る
          </Link>
        </section>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-widest text-red-600">
              ADMINISTRATOR MODE
            </p>

            <h1 className="mt-1 text-3xl font-black text-slate-900 sm:text-4xl">
              管理者モード
            </h1>

            <p className="mt-2 text-slate-600">
              ユーザー・エラー・商品・保管場所などを管理します。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-slate-500">
                操作中の管理者
              </p>

              <p className="font-black text-slate-900">
                {user.displayName}
              </p>
            </div>

            <Link
              href="/"
              className="rounded-xl bg-slate-800 px-4 py-3 font-bold text-white transition hover:bg-slate-700"
            >
              ホームへ戻る
            </Link>
          </div>
        </header>

        <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="font-bold text-red-800">
            管理者操作の注意
          </p>

          <p className="mt-2 text-sm leading-6 text-red-700">
            ユーザー停止・パスワード再発行・データ初期化などは、他の利用者の作業に影響する可能性があります。
            内容を確認してから実行してください。
          </p>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
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

                <p className="mt-2 leading-6 text-slate-600">
                  {menu.description}
                </p>
              </article>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}