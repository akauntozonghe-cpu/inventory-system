"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CurrentUser = {
  id: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
};

type Notification = {
  id: string;
  type: string;
  audience: "ADMIN" | "USER";
  title: string;
  message: string;
  detail: unknown;
  recipientUserId: string | null;
  stocktakeSessionId: string | null;
  readAt: string | null;
  createdAt: string;
};

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
    "displayName" in value &&
    "role" in value &&
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    (value.role === "ADMIN" || value.role === "WORKER")
  );
}

function isNotificationList(
  value: unknown
): value is { notifications: Notification[]; unreadCount: number } {
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
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function notificationIcon(type: string) {
  if (type.includes("REGISTRATION")) {
    return "📦";
  }

  if (type.includes("STOCKTAKE")) {
    return "📋";
  }

  if (type.includes("ERROR")) {
    return "⚠️";
  }

  return "🔔";
}

function detailLink(notification: Notification) {
  if (notification.stocktakeSessionId) {
    return `/stocktake/${notification.stocktakeSessionId}`;
  }

  return null;
}

export default function NotificationsPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications]
  );

  const displayedNotifications = useMemo(() => {
    if (filter === "UNREAD") {
      return notifications.filter((notification) => !notification.readAt);
    }

    return notifications;
  }, [filter, notifications]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [authResponse, notificationResponse] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/notifications", { cache: "no-store" }),
      ]);

      const [authData, notificationData] = await Promise.all([
        readJson(authResponse),
        readJson(notificationResponse),
      ]);

      if (authResponse.status === 401) {
        router.replace("/login");
        return;
      }

      if (!authResponse.ok || !isCurrentUser(authData)) {
        throw new Error("ログイン情報を確認できませんでした。");
      }

      if (!notificationResponse.ok || !isNotificationList(notificationData)) {
        throw new Error(
          getMessage(notificationData, "通知を取得できませんでした。")
        );
      }

      setCurrentUser(authData);
      setNotifications(notificationData.notifications);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "通知を取得できませんでした。"
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const markAsRead = async (notificationIds: string[]) => {
    if (notificationIds.length === 0) {
      return;
    }

    try {
      setUpdating(true);
      setError("");
      setNotice("");

      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notificationIds,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(data, "通知を既読にできませんでした。")
        );
      }

      setNotifications((current) =>
        current.map((notification) =>
          notificationIds.includes(notification.id)
            ? {
                ...notification,
                readAt: new Date().toISOString(),
              }
            : notification
        )
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "通知を既読にできませんでした。"
      );
    } finally {
      setUpdating(false);
    }
  };

  const markAllAsRead = async () => {
    if (unreadCount === 0) {
      return;
    }

    try {
      setUpdating(true);
      setError("");
      setNotice("");

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
          getMessage(data, "通知を既読にできませんでした。")
        );
      }

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          readAt: notification.readAt ?? new Date().toISOString(),
        }))
      );

      setNotice("すべての通知を既読にしました。");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "通知を既読にできませんでした。"
      );
    } finally {
      setUpdating(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black tracking-widest text-blue-600">
              INVENTORY OS
            </p>

            <h1 className="mt-1 text-3xl font-black">
              通知
            </h1>

            <p className="mt-2 text-slate-600">
              {currentUser
                ? `${currentUser.displayName}さんへのお知らせ`
                : "システムからのお知らせ"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || updating}
              className="rounded-xl bg-white px-4 py-3 font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              更新
            </button>

            <Link
              href="/"
              className="rounded-xl bg-slate-800 px-4 py-3 font-bold text-white hover:bg-slate-700"
            >
              ホームへ戻る
            </Link>
          </div>
        </header>

        {error && (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="font-black text-red-700">
              通知を処理できませんでした
            </p>
            <p className="mt-2 text-red-800">{error}</p>
          </section>
        )}

        {notice && (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="font-bold text-emerald-700">{notice}</p>
          </section>
        )}

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-500">
                未読通知
              </p>
              <p className="mt-1 text-3xl font-black text-blue-600">
                {unreadCount}件
              </p>
            </div>

            <button
              type="button"
              onClick={() => void markAllAsRead()}
              disabled={updating || unreadCount === 0}
              className="rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              すべて既読にする
            </button>
          </div>
        </section>

        <nav className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`rounded-full px-5 py-3 font-bold ${
              filter === "ALL"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-700 shadow-sm"
            }`}
          >
            すべて
          </button>

          <button
            type="button"
            onClick={() => setFilter("UNREAD")}
            className={`rounded-full px-5 py-3 font-bold ${
              filter === "UNREAD"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-700 shadow-sm"
            }`}
          >
            未読のみ
          </button>
        </nav>

        <section className="mt-5 space-y-3">
          {loading ? (
            <div className="rounded-3xl bg-white p-10 text-center text-slate-500 shadow-sm">
              通知を読み込んでいます…
            </div>
          ) : displayedNotifications.length === 0 ? (
            <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
              <p className="text-lg font-black text-slate-800">
                {filter === "UNREAD"
                  ? "未読の通知はありません。"
                  : "通知はありません。"}
              </p>
            </div>
          ) : (
            displayedNotifications.map((notification) => {
              const link = detailLink(notification);

              return (
                <article
                  key={notification.id}
                  className={`rounded-2xl border p-5 shadow-sm ${
                    notification.readAt
                      ? "border-slate-200 bg-white"
                      : "border-blue-200 bg-blue-50"
                  }`}
                >
                  <div className="flex gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-2xl shadow-sm">
                      {notificationIcon(notification.type)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h2 className="font-black text-slate-950">
                            {notification.title}
                          </h2>

                          <p className="mt-1 text-xs text-slate-500">
                            {formatDate(notification.createdAt)}
                          </p>
                        </div>

                        {!notification.readAt && (
                          <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-black text-white">
                            未読
                          </span>
                        )}
                      </div>

                      <p className="mt-3 whitespace-pre-wrap leading-6 text-slate-700">
                        {notification.message}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {link && (
                          <Link
                            href={link}
                            onClick={() => {
                              if (!notification.readAt) {
                                void markAsRead([notification.id]);
                              }
                            }}
                            className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700"
                          >
                            関連する棚卸を開く
                          </Link>
                        )}

                        {!notification.readAt && (
                          <button
                            type="button"
                            onClick={() =>
                              void markAsRead([notification.id])
                            }
                            disabled={updating}
                            className="rounded-xl bg-white px-4 py-2 font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                          >
                            既読にする
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}