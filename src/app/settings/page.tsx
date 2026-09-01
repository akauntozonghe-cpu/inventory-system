"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
  mustChangePassword?: boolean;
};

type SettingMenu = {
  href: string;
  icon: string;
  title: string;
  description: string;
  adminOnly?: boolean;
  danger?: boolean;
};

const settingMenus: SettingMenu[] = [
  {
    href: "/account/password",
    icon: "🔐",
    title: "パスワード変更",
    description:
      "現在ログインしている自分のパスワードを変更します。",
  },
  {
    href: "/admin/users",
    icon: "👥",
    title: "ユーザー管理",
    description:
      "ユーザーの登録・停止・パスワード再発行を行います。",
    adminOnly: true,
  },
  {
    href: "/admin/classifications?section=locations",
    icon: "📍",
    title: "分類・保管場所管理",
    description:
      "大分類・小分類・保管場所と所属商品をまとめて整理します。",
    adminOnly: true,
  },
  {
    href: "/admin/error-reports",
    icon: "🛡️",
    title: "エラー報告・復旧",
    description:
      "自動復旧できなかったシステムエラーを確認・対応します。",
    adminOnly: true,
  },
  {
    href: "/reset",
    icon: "⚠️",
    title: "データ初期化",
    description:
      "テストデータなどを初期化します。実行前に内容を確認してください。",
    adminOnly: true,
    danger: true,
  },
];

export default function SettingsPage() {
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
          throw new Error("ログイン情報を確認できませんでした。");
        }

        setUser((await response.json()) as CurrentUser);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "設定情報を取得できませんでした。"
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
        <p className="font-bold text-slate-600">設定を読み込み中…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-5">
        <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-red-600">
            設定を開けません
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

  const visibleMenus = settingMenus.filter(
    (menu) => !menu.adminOnly || user.role === "ADMIN"
  );

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-widest text-blue-600">
              ACCOUNT SETTINGS
            </p>

            <h1 className="mt-1 text-3xl font-black text-slate-900">
              設定
            </h1>

            <p className="mt-2 text-slate-600">
              アカウントとシステムの設定を管理します。
            </p>
          </div>

          <Link
            href="/"
            className="rounded-xl bg-slate-800 px-4 py-3 text-center font-bold text-white transition hover:bg-slate-700"
          >
            ホームへ戻る
          </Link>
        </header>

        <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            現在ログイン中
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-2xl font-black text-slate-900">
              {user.displayName}
            </p>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            ログインID：{user.username}
          </p>
        </section>

        <section className="mt-6 grid gap-5 sm:grid-cols-2">
          {visibleMenus.map((menu) => (
            <Link key={menu.href} href={menu.href}>
              <article
                className={`h-full rounded-2xl bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${
                  menu.danger
                    ? "ring-1 ring-red-200"
                    : ""
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl text-3xl ${
                      menu.danger
                        ? "bg-red-100"
                        : "bg-slate-100"
                    }`}
                  >
                    {menu.icon}
                  </div>

                  <div>
                    <h2
                      className={`text-xl font-black ${
                        menu.danger
                          ? "text-red-700"
                          : "text-slate-900"
                      }`}
                    >
                      {menu.title}
                    </h2>

                    <p className="mt-2 leading-6 text-slate-600">
                      {menu.description}
                    </p>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </section>

        {user.role === "ADMIN" && (
          <div className="mt-8">
            <Link
              href="/admin"
              className="inline-flex rounded-xl bg-slate-800 px-5 py-3 font-bold text-white transition hover:bg-slate-700"
            >
              システム管理を開く
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
