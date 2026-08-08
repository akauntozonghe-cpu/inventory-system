"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
  isActive: boolean;
};

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    username: "",
    displayName: "",
    password: "",
    role: "WORKER",
  });

  const loadUsers = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/users");

      if (response.status === 403) {
        router.replace("/");
        return;
      }

      if (!response.ok) {
        throw new Error("ユーザー一覧を取得できませんでした。");
      }

      setUsers(await response.json());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "エラーが発生しました。"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const createUser = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "ユーザーを追加できませんでした。");
      }

      setForm({
        username: "",
        displayName: "",
        password: "",
        role: "WORKER",
      });

      await loadUsers();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "エラーが発生しました。"
      );
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (user: User) => {
    const nextActive = !user.isActive;

    if (
      !window.confirm(
        `${user.displayName} を${nextActive ? "有効" : "停止"}にしますか？`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isActive: nextActive,
        }),
      });

      const data = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "更新できませんでした。");
      }

      await loadUsers();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "エラーが発生しました。"
      );
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-blue-600">
              ADMINISTRATION
            </p>
            <h1 className="text-3xl font-black">
              ユーザー管理
            </h1>
          </div>

          <button
            type="button"
            onClick={() => router.replace("/")}
            className="rounded-xl bg-slate-700 px-4 py-3 font-bold text-white"
          >
            ホームへ戻る
          </button>
        </header>

        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700"
          >
            {error}
          </p>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-black">
            新しいユーザーを追加
          </h2>

          <form
            onSubmit={createUser}
            className="mt-5 grid gap-4 sm:grid-cols-2"
          >
            <label className="font-bold">
              ログインID
              <input
                value={form.username}
                onChange={(event) =>
                  setForm({ ...form, username: event.target.value })
                }
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
                required
              />
            </label>

            <label className="font-bold">
              表示名・担当者名
              <input
                value={form.displayName}
                onChange={(event) =>
                  setForm({ ...form, displayName: event.target.value })
                }
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
                required
              />
            </label>

            <label className="font-bold">
              初期パスワード
              <input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
                minLength={10}
                required
              />
            </label>

            <label className="font-bold">
              権限
              <select
                value={form.role}
                onChange={(event) =>
                  setForm({ ...form, role: event.target.value })
                }
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
              >
                <option value="WORKER">作業者</option>
                <option value="ADMIN">管理者</option>
              </select>
            </label>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-5 py-3 font-black text-white disabled:bg-slate-400 sm:col-span-2"
            >
              {saving ? "登録中..." : "ユーザーを追加する"}
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-black">
            登録ユーザー
          </h2>

          {loading ? (
            <p className="mt-5 text-slate-500">読み込み中...</p>
          ) : (
            <div className="mt-5 space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                >
                  <div>
                    <p className="font-black">
                      {user.displayName}
                    </p>
                    <p className="text-sm text-slate-600">
                      ID：{user.username} ・{" "}
                      {user.role === "ADMIN" ? "管理者" : "作業者"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => changeStatus(user)}
                    className={`rounded-xl px-4 py-2 font-bold ${
                      user.isActive
                        ? "bg-orange-100 text-orange-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {user.isActive ? "停止する" : "有効にする"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}