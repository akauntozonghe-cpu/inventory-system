"use client";

import { useState } from "react";

type AdminUser = {
  id: string;
  username: string;
  displayName: string;
};

type Props = {
  open: boolean;
  sessionId: string;
  onClose: () => void;
  onAuthenticated: (admin: AdminUser) => void;
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

export default function AdminModeDialog({
  open,
  sessionId,
  onClose,
  onAuthenticated,
}: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!open) {
    return null;
  }

  const close = () => {
    if (loading) {
      return;
    }

    setPassword("");
    setErrorMessage("");
    onClose();
  };

  const authenticate = async () => {
    if (!username.trim() || !password) {
      setErrorMessage("管理者IDとパスワードを入力してください。");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/admin/re-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
          route: window.location.pathname,
          sessionId,
        }),
      });

      const text = await response.text();
      let data: unknown = null;

      try {
        data = text ? (JSON.parse(text) as unknown) : null;
      } catch {
        throw new Error("管理者認証の応答を確認できませんでした。");
      }

      if (!response.ok) {
        throw new Error(
          getMessage(data, "管理者IDまたはパスワードが一致しません。")
        );
      }

      if (
        !data ||
        typeof data !== "object" ||
        !("admin" in data) ||
        typeof data.admin !== "object" ||
        data.admin === null ||
        !("id" in data.admin) ||
        !("username" in data.admin) ||
        !("displayName" in data.admin) ||
        typeof data.admin.id !== "string" ||
        typeof data.admin.username !== "string" ||
        typeof data.admin.displayName !== "string"
      ) {
        throw new Error("管理者認証の結果を確認できませんでした。");
      }

      onAuthenticated({
        id: data.admin.id,
        username: data.admin.username,
        displayName: data.admin.displayName,
      });

      setPassword("");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "管理者認証中にエラーが発生しました。"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/70 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-mode-title"
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
      >
        <p className="text-sm font-bold text-blue-600">管理者モード</p>

        <h2
          id="admin-mode-title"
          className="mt-2 text-2xl font-black text-slate-900"
        >
          管理者認証
        </h2>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          商品登録・商品情報修正・システムJAN発行を行うため、管理者IDとパスワードを入力してください。
          認証後10分で自動的に解除されます。
        </p>

        <label className="mt-5 block text-sm font-bold text-slate-800">
          管理者ID
        </label>
        <input
          value={username}
          autoComplete="username"
          disabled={loading}
          onChange={(event) => setUsername(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void authenticate();
            }
          }}
          className="mt-2 w-full rounded-2xl border-2 border-slate-200 px-4 py-3 outline-none focus:border-blue-500 disabled:bg-slate-100"
        />

        <label className="mt-4 block text-sm font-bold text-slate-800">
          管理者パスワード
        </label>
        <input
          type="password"
          value={password}
          autoComplete="current-password"
          disabled={loading}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void authenticate();
            }
          }}
          className="mt-2 w-full rounded-2xl border-2 border-slate-200 px-4 py-3 outline-none focus:border-blue-500 disabled:bg-slate-100"
        />

        {errorMessage && (
          <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={close}
            className="rounded-2xl bg-slate-100 px-4 py-3 font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
          >
            キャンセル
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => void authenticate()}
            className="rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-700 disabled:bg-slate-300"
          >
            {loading ? "認証中…" : "管理者モードを開始"}
          </button>
        </div>
      </section>
    </div>
  );
}