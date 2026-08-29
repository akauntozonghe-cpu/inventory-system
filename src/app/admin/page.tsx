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

type MenuItem = {
  href: string;
  icon: string;
  title: string;
  description: string;
  color: string;
};

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

const stocktakeMenus: MenuItem[] = [
  {
    href: "/admin/stocktake",
    icon: "📋",
    title: "棚卸管理",
    description:
      "全体の棚卸を確認し、中断・競合・確認待ち・終了済みの状態を管理します。",
    color: "bg-violet-600",
  },
  {
    href: "/stocktake/history",
    icon: "🕘",
    title: "棚卸履歴",
    description:
      "過去の棚卸結果、差異、担当者、実施日時を確認できます。",
    color: "bg-sky-600",
  },
  {
    href: "/admin/category-qr",
    icon: "▣",
    title: "大分類QR管理",
    description:
      "大分類ごとのQRを発行し、棚卸時の分類別作業に利用できます。",
    color: "bg-fuchsia-600",
  },
];

const inventoryMenus: MenuItem[] = [
  {
    href: "/admin/marketplace",
    icon: "🛍️",
    title: "フリマ出品・販売連携",
    description: "出品候補、出品中、売却、在庫減算、CSV連携をまとめて管理します。",
    color: "bg-pink-600",
  },
  {
    href: "/admin/activity",
    icon: "📅",
    title: "作業カレンダー",
    description: "日付ごとの商品登録、棚卸、在庫変更、管理操作を確認し、その日の登録分を印刷します。",
    color: "bg-rose-600",
  },
  {
    href: "/items",
    icon: "🏷️",
    title: "商品・在庫一覧",
    description:
      "商品情報、JAN、システムバーコード、分類、保管場所、在庫情報を確認・編集します。",
    color: "bg-emerald-600",
  },
  {
    href: "/add",
    icon: "＋",
    title: "商品・在庫を登録",
    description:
      "新しい商品や在庫を登録します。JANがない商品にはシステムバーコードを発行できます。",
    color: "bg-orange-500",
  },
  {
    href: "/locations",
    icon: "📍",
    title: "保管場所管理",
    description:
      "倉庫、棚、引き出しなどの保管場所を登録・編集します。",
    color: "bg-indigo-600",
  },
];

const systemMenus: MenuItem[] = [
  {
    href: "/admin/operation-mode",
    icon: "🛠️",
    title: "運用モード設定",
    description: "通常・テスト・メンテナンスを切り替え、自動点検間隔と利用者案内を設定します。",
    color: "bg-amber-600",
  },
  {
    href: "/admin/system-check",
    icon: "🩺",
    title: "システム点検",
    description:
      "自動点検と手動点検で、DB・権限・棚卸状態・データ整合性を確認します。",
    color: "bg-cyan-600",
  },
  {
    href: "/admin/export",
    icon: "⇩",
    title: "バックアップ・CSV出力",
    description:
      "商品・在庫・棚卸履歴・監査ログをCSVとして端末へ保存します。",
    color: "bg-lime-600",
  },
  {
    href: "/admin/users",
    icon: "👥",
    title: "ユーザー管理",
    description:
      "ユーザー登録、権限変更、有効・無効化、パスワード再設定を行います。",
    color: "bg-blue-600",
  },
  {
    href: "/admin/error-reports",
    icon: "⚠️",
    title: "エラー・復旧レポート",
    description:
      "自動復旧できなかったエラー、操作ログ、対応状況を確認します。",
    color: "bg-red-600",
  },
  {
    href: "/account/password",
    icon: "🔐",
    title: "自分のパスワード変更",
    description:
      "現在ログインしている管理者自身のパスワードを変更します。",
    color: "bg-slate-700",
  },
];

export default function AdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
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
          router.replace("/login?next=/admin");
          return;
        }

        const candidate =
          data &&
          typeof data === "object" &&
          "user" in data &&
          data.user &&
          typeof data.user === "object"
            ? data.user
            : data;

        if (!response.ok || !isCurrentUser(candidate)) {
          throw new Error(
            getMessage(data, "ログイン情報を確認できませんでした。")
          );
        }

        if (candidate.role !== "ADMIN") {
          router.replace("/");
          return;
        }

        if (!cancelled) {
          setUser(candidate);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "管理者情報を取得できませんでした。"
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
          <p className="text-sm font-black text-red-600">ADMIN_AUTH_ERROR</p>

          <h1 className="mt-1 text-2xl font-black text-slate-950">
            管理者画面を開けませんでした
          </h1>

          <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-800">
            {error}
          </p>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700"
            >
              再読み込み
            </button>

            <Link
              href="/"
              className="rounded-xl bg-slate-700 px-4 py-3 font-bold text-white hover:bg-slate-800"
            >
              ホームへ戻る
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black tracking-[0.14em] text-violet-600">
              ADMINISTRATOR MODE
            </p>

            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
              管理者メニュー
            </h1>

            <p className="mt-2 max-w-2xl leading-6 text-slate-600">
              棚卸、商品・在庫、ユーザー、エラー、システム状態を管理する画面です。
              日常の棚卸作業はホーム画面から開始してください。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-slate-500">
                管理者としてログイン中
              </p>

              <p className="font-black text-slate-950">{user.displayName}</p>
            </div>

            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-800 px-5 font-bold text-white hover:bg-slate-700"
            >
              ホームへ戻る
            </Link>
          </div>
        </header>

        <section className="mt-7 rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-black text-amber-950">
            管理者操作について
          </h2>

          <p className="mt-2 text-sm leading-6 text-amber-900">
            商品情報、在庫情報、ユーザー、棚卸状態を変更する操作は監査ログへ記録されます。
            日常作業で不要な場合は、この画面を閉じてホーム画面から作業してください。
          </p>
        </section>

        <MenuSection title="棚卸管理" menus={stocktakeMenus} />
        <MenuSection title="商品・在庫管理" menus={inventoryMenus} />
        <MenuSection title="システム・運用管理" menus={systemMenus} />
      </div>
    </main>
  );
}

function MenuSection({
  title,
  menus,
}: {
  title: string;
  menus: MenuItem[];
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-black text-slate-950">{title}</h2>

      <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {menus.map((menu) => (
          <Link key={menu.href} href={menu.href} className="group">
            <article className="h-full rounded-3xl bg-white p-6 shadow-sm transition duration-200 group-hover:-translate-y-1 group-hover:shadow-lg">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black text-white ${menu.color}`}
              >
                {menu.icon}
              </div>

              <h3 className="mt-5 text-xl font-black text-slate-950">
                {menu.title}
              </h3>

              <p className="mt-2 leading-6 text-slate-600">
                {menu.description}
              </p>

              <p className="mt-5 text-sm font-bold text-blue-600">
                開く →
              </p>
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}
