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

type Menu = {
  href: string;
  icon: string;
  title: string;
  description: string;
  color: string;
};

const menus: Menu[] = [
  {
    href: "/admin/users",
    icon: "👥",
    title: "ユーザー管理",
    description:
      "ユーザーの登録・有効化・無効化・役割変更・仮パスワード発行を行います。",
    color: "bg-blue-500",
  },
  {
    href: "/admin/error-reports",
    icon: "🛡️",
    title: "エラーレポート",
    description:
      "自動復旧できなかったエラーの確認、対応状況の更新、管理者対応を行います。",
    color: "bg-red-500",
  },
  {
    href: "/admin/category-qr",
    icon: "📱",
    title: "大分類QRラベル",
    description:
      "大分類ごとのQRラベルを発行・印刷します。棚やケースに貼って使います。",
    color: "bg-indigo-500",
  },
  {
    href: "/add",
    icon: "➕",
    title: "商品登録",
    description:
      "新しい商品と初期在庫を登録します。JANがない商品にはシステムJANを発行できます。",
    color: "bg-emerald-500",
  },
  {
    href: "/items",
    icon: "🏷️",
    title: "商品・ラベル管理",
    description:
      "商品情報の確認、編集、既存JAN・システムJANのラベル印刷を行います。",
    color: "bg-orange-500",
  },
  {
    href: "/locations",
    icon: "📍",
    title: "保管場所管理",
    description:
      "倉庫・棚・引き出しなどの保管場所を登録・管理します。",
    color: "bg-purple-500",
  },
  {
    href: "/stocktake/history",
    icon: "📋",
    title: "棚卸履歴",
    description:
      "完了した棚卸の履歴、進捗、差異、確定内容を確認します。",
    color: "bg-cyan-500",
  },
  {
    href: "/account/password",
    icon: "🔐",
    title: "パスワード変更",
    description:
      "現在ログインしている管理者のパスワードを変更します。",
    color: "bg-slate-600",
  },
];

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

        const text = await response.text();

        let data: unknown = null;

        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          throw new Error("ログイン情報の形式を確認できませんでした。");
        }

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok) {
          throw new Error(
            getMessage(data, "ログイン情報を取得できませんでした。")
          );
        }

        if (
          typeof data !== "object" ||
          data === null ||
          !("role" in data) ||
          data.role !== "ADMIN"
        ) {
          router.replace("/");
          return;
        }

        setUser(data as CurrentUser);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
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
      <main className="grid min-h-screen place-items-center bg-slate-100 p-5">
        <p className="font-bold text-slate-600">
          管理者情報を確認しています…
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-5">
        <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-red-600">
            管理者モードを開けませんでした
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
              管理者設定
            </h1>

            <p className="mt-2 text-slate-600">
              ユーザー、商品ラベル、保管場所、エラー対応などのシステム設定を管理します。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-slate-500">
                ログイン中の管理者
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
            管理者操作について
          </p>

          <p className="mt-2 text-sm leading-6 text-red-700">
            ユーザーの権限変更、パスワード再設定、システムJAN発行、データの管理は管理者だけが実行できます。操作前に内容を確認してください。
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