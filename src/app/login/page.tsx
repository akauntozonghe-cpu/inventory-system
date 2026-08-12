"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoggedInUser = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
  mustChangePassword: boolean;
};

type LoginResult = {
  success?: boolean;
  user?: LoggedInUser;
  code?: string;
  message?: string;
};

async function readLoginResponse(
  response: Response
): Promise<LoginResult> {
  const text = await response.text();

  if (!text) {
    return {
      code: "AUTH_LOGIN_EMPTY_RESPONSE",
      message: "ログイン処理の応答がありませんでした。",
    };
  }

  try {
    return JSON.parse(text) as LoginResult;
  } catch {
    return {
      code: "AUTH_LOGIN_INVALID_RESPONSE",
      message:
        "ログイン処理の応答を読み取れませんでした。ページを再読み込みしてから、もう一度お試しください。",
    };
  }
}

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");
    setErrorCode("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await readLoginResponse(response);

      if (!response.ok) {
        setErrorCode(data.code ?? `AUTH_LOGIN_HTTP_${response.status}`);
        setError(data.message ?? "ログインできませんでした。");
        return;
      }

      const user = data.user;

      if (
        !user ||
        !user.id ||
        !user.username ||
        !user.displayName ||
        !user.role
      ) {
        setErrorCode("AUTH_LOGIN_INVALID_DATA");
        setError(
          "ログイン情報が不完全です。もう一度ログインしてください。"
        );
        return;
      }

      if (user.mustChangePassword) {
        router.replace("/account/password");
      } else {
        router.replace("/");
      }

      router.refresh();
    } catch {
      setErrorCode("AUTH_LOGIN_NETWORK_ERROR");
      setError(
        "通信に失敗しました。接続を確認して、もう一度お試しください。"
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

        <h1 className="mt-2 text-3xl font-black text-slate-900">
          ログイン
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          ログインIDとパスワードを入力してください。
        </p>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <p className="font-bold">{error}</p>

            {errorCode && (
              <p className="mt-1 text-xs">
                エラーコード：{errorCode}
              </p>
            )}
          </div>
        )}

        <form onSubmit={login} className="mt-6 space-y-5">
          <label className="block font-bold text-slate-800">
            ログインID

            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              autoComplete="username"
              disabled={loading}
              required
            />
          </label>

          <label className="block font-bold text-slate-800">
            パスワード

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              autoComplete="current-password"
              disabled={loading}
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3.5 font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "ログイン中…" : "ログインする"}
          </button>
        </form>
      </section>
    </main>
  );
}