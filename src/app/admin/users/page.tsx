"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FeedbackToast from "@/components/common/FeedbackToast";
import {
  DEFAULT_WORKER_FEATURES,
  FEATURE_KEYS,
  FEATURE_LABELS,
  type FeatureKey,
} from "@/lib/feature-permissions";

type UserRole = "ADMIN" | "WORKER";

type User = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  featurePermissions: FeatureKey[];
};

type UserForm = {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
  featurePermissions: FeatureKey[];
};

type IssuedPassword = {
  displayName: string;
  password: string;
  label: "初期パスワード" | "仮パスワード";
};

const initialForm: UserForm = {
  username: "",
  displayName: "",
  password: "",
  role: "WORKER",
  featurePermissions: DEFAULT_WORKER_FEATURES,
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

function createTemporaryPassword(length = 14) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!#$%&*+-=?@";
  const all = `${upper}${lower}${numbers}${symbols}`;

  const randomIndex = (max: number) => {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % max;
  };

  const password = [
    upper[randomIndex(upper.length)],
    lower[randomIndex(lower.length)],
    numbers[randomIndex(numbers.length)],
    symbols[randomIndex(symbols.length)],
  ];

  while (password.length < length) {
    password.push(all[randomIndex(all.length)]);
  }

  for (let index = password.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);

    [password[index], password[target]] = [
      password[target],
      password[index],
    ];
  }

  return password.join("");
}

export default function UserManagementPage() {
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<UserForm>(initialForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] =
    useState("");

  const [statusTarget, setStatusTarget] = useState<User | null>(null);

  const updatePermissions = async (user: User, feature: FeatureKey) => {
    const nextPermissions = user.featurePermissions.includes(feature)
      ? user.featurePermissions.filter((value) => value !== feature)
      : [...user.featurePermissions, feature];

    setActionUserId(user.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featurePermissions: nextPermissions }),
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(getMessage(data, "利用機能を変更できませんでした。"));
      setUsers((previous) =>
        previous.map((entry) =>
          entry.id === user.id ? { ...entry, featurePermissions: nextPermissions } : entry
        )
      );
      setSuccess(`${user.displayName}さんの利用機能を更新しました。`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "利用機能を変更できませんでした。");
    } finally {
      setActionUserId(null);
    }
  };

  const [issuedPassword, setIssuedPassword] =
    useState<IssuedPassword | null>(null);

  useEffect(() => {
    setForm((previous) =>
      previous.password
        ? previous
        : {
            ...previous,
            password: createTemporaryPassword(),
          }
    );
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/users", {
        cache: "no-store",
      });

      const data: unknown = await response.json();

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (response.status === 403) {
        router.replace("/");
        return;
      }

      if (!response.ok) {
        throw new Error(
          getMessage(data, "ユーザー一覧を取得できませんでした。")
        );
      }

      if (!Array.isArray(data)) {
        throw new Error("ユーザー一覧の形式が正しくありません。");
      }

      setUsers(data as User[]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "ユーザー一覧を取得できませんでした。"
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    const createdDisplayName = form.displayName;
    const createdPassword = form.password;

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getMessage(data, "ユーザーを登録できませんでした。")
        );
      }

      setForm({
        ...initialForm,
        password: createTemporaryPassword(),
      });

      setIssuedPassword({
        displayName: createdDisplayName,
        password: createdPassword,
        label: "初期パスワード",
      });

      setSuccess(
        "ユーザーを登録しました。初期パスワードを本人へ安全な方法で伝えてください。"
      );

      await loadUsers();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "ユーザーを登録できませんでした。"
      );
    } finally {
      setSaving(false);
    }
  };

  const openStatusChange = (user: User) => {
    setStatusTarget(user);
    setError("");
    setSuccess("");
  };

  const submitStatusChange = async () => {
    if (!statusTarget) {
      return;
    }

    const nextIsActive = !statusTarget.isActive;
    const actionLabel = nextIsActive ? "有効化" : "停止";

    setActionUserId(statusTarget.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/users/${statusTarget.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isActive: nextIsActive,
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getMessage(data, "ユーザー状態を変更できませんでした。")
        );
      }

      setSuccess(`${statusTarget.displayName} さんを${actionLabel}しました。`);
      setStatusTarget(null);

      await loadUsers();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "ユーザー状態を変更できませんでした。"
      );
    } finally {
      setActionUserId(null);
    }
  };

  const openPasswordReset = (user: User) => {
    const password = createTemporaryPassword();

    setResetTarget(user);
    setTemporaryPassword(password);
    setConfirmTemporaryPassword(password);
    setError("");
    setSuccess("");
  };

  const submitPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!resetTarget) {
      return;
    }

    if (temporaryPassword.length < 10) {
      setError("仮パスワードは10文字以上にしてください。");
      return;
    }

    if (temporaryPassword !== confirmTemporaryPassword) {
      setError("確認用パスワードが一致しません。");
      return;
    }

    setActionUserId(resetTarget.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `/api/users/${resetTarget.id}/password`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            temporaryPassword,
          }),
        }
      );

      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getMessage(data, "パスワードを再設定できませんでした。")
        );
      }

      setIssuedPassword({
        displayName: resetTarget.displayName,
        password: temporaryPassword,
        label: "仮パスワード",
      });

      setSuccess(
        `${resetTarget.displayName} さんの仮パスワードを設定しました。本人に安全な方法で伝えてください。`
      );

      setResetTarget(null);
      setTemporaryPassword("");
      setConfirmTemporaryPassword("");

      await loadUsers();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "パスワードを再設定できませんでした。"
      );
    } finally {
      setActionUserId(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <FeedbackToast message={error} tone="error" title="ユーザー操作エラー" onClose={() => setError("")} />
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-widest text-blue-600">
              INVENTORY OS
            </p>

            <h1 className="mt-1 text-3xl font-black">ユーザー管理</h1>

            <p className="mt-2 text-slate-600">
              作業者の追加・停止・パスワード再設定を行います。
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-xl bg-slate-800 px-5 py-3 font-bold text-white transition hover:bg-slate-700"
          >
            ホームへ戻る
          </button>
        </div>

        {success && (
          <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-green-800">
            <p className="font-bold">完了</p>
            <p className="mt-1">{success}</p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[390px_1fr]">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">新しいユーザーを登録</h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              初期パスワードは自動生成され、本人は初回ログイン後に必ず変更します。
            </p>

            <form className="mt-6 space-y-5" onSubmit={createUser}>
              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block text-sm font-bold"
                >
                  ログインID
                </label>

                <input
                  id="username"
                  value={form.username}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      username: event.target.value,
                    }))
                  }
                  placeholder="例：tanaka"
                  autoComplete="username"
                  required
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="displayName"
                  className="mb-2 block text-sm font-bold"
                >
                  表示名
                </label>

                <input
                  id="displayName"
                  value={form.displayName}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      displayName: event.target.value,
                    }))
                  }
                  placeholder="例：田中 太郎"
                  required
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="password" className="block text-sm font-bold">
                    初期パスワード
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      setForm((previous) => ({
                        ...previous,
                        password: createTemporaryPassword(),
                      }))
                    }
                    className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-300"
                  >
                    自動生成
                  </button>
                </div>

                <input
                  id="password"
                  type="text"
                  value={form.password}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      password: event.target.value,
                    }))
                  }
                  autoComplete="off"
                  minLength={10}
                  required
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />

                <p className="mt-2 text-xs text-slate-500">
                  14文字の安全なパスワードを自動入力しています。
                </p>
              </div>

              <div>
                <label
                  htmlFor="role"
                  className="mb-2 block text-sm font-bold"
                >
                  権限
                </label>

                <select
                  id="role"
                  value={form.role}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      role: event.target.value as UserRole,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="WORKER">作業者</option>
                  <option value="ADMIN">管理者</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? "登録中..." : "ユーザーを登録する"}
              </button>
            </form>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">登録ユーザー</h2>

                <p className="mt-1 text-sm text-slate-600">
                  停止中のユーザーはログインできません。
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadUsers()}
                disabled={loading}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                更新
              </button>
            </div>

            {loading ? (
              <p className="py-10 text-center text-slate-500">
                ユーザー一覧を読み込み中...
              </p>
            ) : users.length === 0 ? (
              <p className="py-10 text-center text-slate-500">
                登録されているユーザーはいません。
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {users.map((user) => {
                  const busy = actionUserId === user.id;

                  return (
                    <article
                      key={user.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-black">
                              {user.displayName}
                            </h3>

                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                user.role === "ADMIN"
                                  ? "bg-violet-100 text-violet-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {user.role === "ADMIN" ? "管理者" : "作業者"}
                            </span>

                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                user.isActive
                                  ? "bg-green-100 text-green-700"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {user.isActive ? "有効" : "停止中"}
                            </span>

                            {user.mustChangePassword && (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                                パスワード変更待ち
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-sm text-slate-600">
                            ログインID：{user.username}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openPasswordReset(user)}
                            disabled={busy || !user.isActive}
                            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            パスワード再設定
                          </button>

                          <button
                            type="button"
                            onClick={() => openStatusChange(user)}
                            disabled={busy}
                            className={`rounded-xl px-4 py-2 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:bg-slate-300 ${
                              user.isActive
                                ? "bg-red-600 hover:bg-red-700"
                                : "bg-green-600 hover:bg-green-700"
                            }`}
                          >
                            {busy
                              ? "処理中..."
                              : user.isActive
                                ? "停止する"
                                : "有効化する"}
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 border-t border-slate-200 pt-4">
                        <p className="text-sm font-black text-slate-900">利用できる機能</p>
                        {user.role === "ADMIN" ? (
                          <p className="mt-2 text-sm font-bold text-violet-700">
                            管理者はすべての機能を利用できます。
                          </p>
                        ) : (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {FEATURE_KEYS.map((feature) => (
                              <label
                                key={feature}
                                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={user.featurePermissions.includes(feature)}
                                  disabled={busy || !user.isActive}
                                  onChange={() => void updatePermissions(user, feature)}
                                  className="mt-1 h-5 w-5 accent-blue-600"
                                />
                                <span>
                                  <span className="block text-sm font-black text-slate-900">
                                    {FEATURE_LABELS[feature].title}
                                  </span>
                                  <span className="mt-1 block text-xs font-semibold text-slate-600">
                                    {FEATURE_LABELS[feature].description}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={submitPasswordReset}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 className="text-xl font-black">仮パスワードを設定</h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              {resetTarget.displayName} さんは次回ログイン時に、
              この仮パスワードから新しいパスワードへ変更します。
            </p>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-bold">
                  仮パスワード
                </label>

                <button
                  type="button"
                  onClick={() => {
                    const password = createTemporaryPassword();
                    setTemporaryPassword(password);
                    setConfirmTemporaryPassword(password);
                  }}
                  className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-300"
                >
                  自動生成
                </button>
              </div>

              <input
                type="text"
                value={temporaryPassword}
                onChange={(event) =>
                  setTemporaryPassword(event.target.value)
                }
                minLength={10}
                autoFocus
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold">
                仮パスワード（確認）
              </label>

              <input
                type="text"
                value={confirmTemporaryPassword}
                onChange={(event) =>
                  setConfirmTemporaryPassword(event.target.value)
                }
                minLength={10}
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="flex-1 rounded-xl bg-slate-200 px-4 py-3 font-bold text-slate-700 hover:bg-slate-300"
              >
                キャンセル
              </button>

              <button
                type="submit"
                disabled={actionUserId === resetTarget.id}
                className="flex-1 rounded-xl bg-amber-500 px-4 py-3 font-bold text-white hover:bg-amber-600 disabled:bg-slate-300"
              >
                {actionUserId === resetTarget.id ? "設定中..." : "設定する"}
              </button>
            </div>
          </form>
        </div>
      )}

      {statusTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-black">
              {statusTarget.isActive
                ? "ユーザーを停止しますか？"
                : "ユーザーを有効化しますか？"}
            </h2>

            <p className="mt-3 leading-7 text-slate-600">
              {statusTarget.isActive
                ? `${statusTarget.displayName} さんは、停止後すぐにログインできなくなります。`
                : `${statusTarget.displayName} さんは、再びログインできるようになります。`}
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setStatusTarget(null)}
                className="flex-1 rounded-xl bg-slate-200 px-4 py-3 font-bold text-slate-700 hover:bg-slate-300"
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={() => void submitStatusChange()}
                disabled={actionUserId === statusTarget.id}
                className={`flex-1 rounded-xl px-4 py-3 font-bold text-white disabled:bg-slate-300 ${
                  statusTarget.isActive
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {actionUserId === statusTarget.id
                  ? "処理中..."
                  : statusTarget.isActive
                    ? "停止する"
                    : "有効化する"}
              </button>
            </div>
          </section>
        </div>
      )}

      {issuedPassword && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-sm font-bold text-blue-600">
              {issuedPassword.label}を発行しました
            </p>

            <h2 className="mt-1 text-2xl font-black">
              {issuedPassword.displayName} さん
            </h2>

            <p className="mt-4 text-sm leading-6 text-slate-600">
              このパスワードは本人へ安全な方法で伝えてください。
              この画面を閉じたあと、同じ値を再表示することはできません。
            </p>

            <div className="mt-5 break-all rounded-xl bg-slate-100 px-4 py-4 font-mono text-xl font-black">
              {issuedPassword.password}
            </div>

            <button
              type="button"
              onClick={() => setIssuedPassword(null)}
              className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700"
            >
              控えました
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
