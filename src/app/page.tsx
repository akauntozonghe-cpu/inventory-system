"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
};

type NotificationItem = {
  id: string;
  type:
    | "STOCKTAKE_COMPLETED"
    | "STOCKTAKE_CONFLICT"
    | "STOCKTAKE_DIFFERENCE"
    | "LOW_STOCK"
    | "EXPIRY_ALERT"
    | "REGISTRATION_REQUEST"
    | "SYSTEM_ERROR";
  title: string;
  message: string;
  stocktakeSessionId: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
};

const menus = [
  {
    title: "棚卸開始",
    description: "新しい棚卸の開始・中断中の棚卸の再開",
    href: "/stocktake/start",
    icon: "📦",
    color: "bg-blue-500",
  },
  {
    title: "商品登録",
    description: "新しい商品と在庫を登録",
    href: "/add",
    icon: "📝",
    color: "bg-emerald-500",
  },
  {
    title: "在庫検索",
    description: "JAN・システムバーコード・商品名から検索",
    href: "/inventory-search",
    icon: "🔍",
    color: "bg-cyan-500",
  },
  {
    title: "商品一覧",
    description: "登録済みの商品情報を確認",
    href: "/items",
    icon: "📋",
    color: "bg-orange-500",
  },
  {
    title: "棚卸履歴",
    description: "過去の棚卸結果を確認",
    href: "/stocktake/history",
    icon: "🕘",
    color: "bg-purple-500",
  },
];

function getMessage(value: unknown, fallback: string) {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }

  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      `サーバーから応答がありません。HTTP ${response.status}`
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `正しい応答を取得できませんでした。HTTP ${response.status}`
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

function isNotificationResponse(
  value: unknown
): value is NotificationResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "notifications" in value &&
    "unreadCount" in value &&
    Array.isArray(value.notifications) &&
    typeof value.unreadCount === "number"
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function notificationStyle(type: NotificationItem["type"]) {
  if (
    type === "STOCKTAKE_CONFLICT" ||
    type === "SYSTEM_ERROR"
  ) {
    return {
      icon: "⚠️",
      className: "border-red-200 bg-red-50 text-red-950",
    };
  }

  if (type === "STOCKTAKE_DIFFERENCE") {
    return {
      icon: "📊",
      className: "border-orange-200 bg-orange-50 text-orange-950",
    };
  }

  if (type === "STOCKTAKE_COMPLETED") {
    return {
      icon: "✅",
      className: "border-emerald-200 bg-emerald-50 text-emerald-950",
    };
  }

  return {
    icon: "🔔",
    className: "border-blue-200 bg-blue-50 text-blue-950",
  };
}

export default function HomePage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [notifications, setNotifications] = useState<
    NotificationItem[]
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [noticeError, setNoticeError] = useState("");
  const [markingReadId, setMarkingReadId] = useState<string | null>(
    null
  );

  const loadNotifications = useCallback(async () => {
    const response = await fetch("/api/notifications", {
      cache: "no-store",
    });

    const data = await readJson(response);

    if (!response.ok || !isNotificationResponse(data)) {
      throw new Error(
        getMessage(
          data,
          "管理者通知を取得できませんでした。"
        )
      );
    }

    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        const data = await readJson(response);

        if (!response.ok || !isCurrentUser(data)) {
          router.replace("/login");
          return;
        }

        if (cancelled) {
          return;
        }

        setUser(data);

        if (data.role === "ADMIN") {
          try {
            await loadNotifications();
          } catch (error) {
            if (!cancelled) {
              setNoticeError(
                error instanceof Error
                  ? error.message
                  : "管理者通知を取得できませんでした。"
              );
            }
          }
        }
      } catch {
        if (!cancelled) {
          router.replace("/login");
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
  }, [loadNotifications, router]);

  const logout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    router.replace("/login");
    router.refresh();
  };

  const markAsRead = async (notificationId: string) => {
    if (markingReadId) {
      return;
    }

    setMarkingReadId(notificationId);
    setNoticeError("");

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notificationIds: [notificationId],
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(
            data,
            "通知を既読にできませんでした。"
          )
        );
      }

      setNotifications((previous) =>
        previous.map((notification) =>
          notification.id === notificationId
            ? {
                ...notification,
                readAt: new Date().toISOString(),
              }
            : notification
        )
      );

      setUnreadCount((previous) => Math.max(0, previous - 1));
    } catch (error) {
      setNoticeError(
        error instanceof Error
          ? error.message
          : "通知を既読にできませんでした。"
      );
    } finally {
      setMarkingReadId(null);
    }
  };

  const markAllAsRead = async () => {
    if (markingReadId || unreadCount === 0) {
      return;
    }

    setMarkingReadId("all");
    setNoticeError("");

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          markAllAsRead: true,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(
            data,
            "通知を既読にできませんでした。"
          )
        );
      }

      const now = new Date().toISOString();

      setNotifications((previous) =>
        previous.map((notification) =>
          notification.readAt === null
            ? {
                ...notification,
                readAt: now,
              }
            : notification
        )
      );

      setUnreadCount(0);
    } catch (error) {
      setNoticeError(
        error instanceof Error
          ? error.message
          : "通知を既読にできませんでした。"
      );
    } finally {
      setMarkingReadId(null);
    }
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100">
        <p className="font-bold text-slate-600">
          読み込み中…
        </p>
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
              棚卸・商品登録・在庫検索
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-slate-500">
                ログイン中
              </p>

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
                href="/admin"
                className="rounded-xl bg-slate-700 px-4 py-3 font-bold text-white transition hover:bg-slate-800"
              >
                管理者設定
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

        {user?.role === "ADMIN" && (
          <section className="mt-8 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-blue-600">
                  管理者通知
                </p>

                <h2 className="mt-1 text-xl font-black text-slate-900">
                  未読通知
                  <span className="ml-2 text-blue-600">
                    {unreadCount}件
                  </span>
                </h2>
              </div>

              <button
                type="button"
                disabled={unreadCount === 0 || markingReadId !== null}
                onClick={() => void markAllAsRead()}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
              >
                {markingReadId === "all"
                  ? "更新中…"
                  : "すべて既読にする"}
              </button>
            </div>

            {noticeError && (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
                {noticeError}
              </p>
            )}

            {notifications.length === 0 ? (
              <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
                現在、管理者が確認する通知はありません。
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {notifications.slice(0, 8).map((notification) => {
                  const style = notificationStyle(notification.type);

                  return (
                    <article
                      key={notification.id}
                      className={`rounded-2xl border p-4 ${style.className} ${
                        notification.readAt
                          ? "opacity-70"
                          : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xl">
                          {style.icon}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-black">
                              {notification.title}
                            </h3>

                            <span className="text-xs opacity-70">
                              {formatDate(notification.createdAt)}
                            </span>
                          </div>

                          <p className="mt-1 text-sm leading-6">
                            {notification.message}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {notification.stocktakeSessionId && (
                              <Link
                                href={`/stocktake/${notification.stocktakeSessionId}/result`}
                                className="rounded-lg bg-white/80 px-3 py-2 text-xs font-bold text-slate-800"
                              >
                                棚卸結果を見る
                              </Link>
                            )}

                            {notification.readAt === null && (
                              <button
                                type="button"
                                disabled={markingReadId !== null}
                                onClick={() =>
                                  void markAsRead(notification.id)
                                }
                                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                              >
                                {markingReadId === notification.id
                                  ? "更新中…"
                                  : "既読にする"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
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

                <p className="mt-2 text-slate-600">
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