"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          displayName,
          password,
        }),
      });

      const data = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "管理者を作成できませんでした。");
      }

      router.replace("/login");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "管理者を作成できませんでした。"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-5">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <p className="text-sm font-bold tracking-widest text-blue-600">
          INVENTORY OS
        </p>

        <h1 className="mt-2 text-3xl font-black">
          初回管理者登録
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          最初にシステム管理者を1人だけ登録します。
        </p>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
          >
            {error}
          </p>
        )}

        <form onSubmit={submit} className="mt-6 space-y-5">
          <label className="block font-bold">
            ログインID
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
              placeholder="例：admin001"
              autoComplete="username"
              required
            />
          </label>

          <label className="block font-bold">
            表示名・担当者名
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
              placeholder="例：村本"
              required
            />
          </label>

          <label className="block font-bold">
            パスワード
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
              placeholder="10文字以上"
              autoComplete="new-password"
              minLength={10}
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3.5 font-black text-white disabled:bg-slate-400"
          >
            {loading ? "登録中..." : "管理者を登録する"}
          </button>
        </form>
      </section>
    </main>
  );
}