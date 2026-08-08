"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.message ?? "ログインできませんでした。"
        );
      }

      // ログイン後は必ずホームへ
      router.replace("/");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "ログインできませんでした。"
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
          ログイン
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          ログインIDとパスワードを入力してください。
        </p>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
          >
            {error}
          </p>
        )}

        <form onSubmit={login} className="mt-6 space-y-5">
          <label className="block font-bold">
            ログインID
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
              autoComplete="username"
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
              autoComplete="current-password"
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3.5 font-black text-white disabled:bg-slate-400"
          >
            {loading ? "ログイン中..." : "ログインする"}
          </button>
        </form>
      </section>
    </main>
  );
}