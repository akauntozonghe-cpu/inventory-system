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
  purpose?: string;
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
  purpose = "保護された操作を行うための認証です。",
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
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/70 p-4">
      <div className="mx-auto flex min-h-full max-w-md items-center">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-mode-title"
          className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
        >
          <p className="text-sm font-bold text-violet-600">SECURE OPERATION</p>

          <h2
            id="admin-mode-title"
            className="mt-2 text-2xl font-black text-slate-950"
          >
            操作の再認証
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            {purpose}
          </p>

          <label className="mt-5 block text-sm font-bold text-slate-800">
            全機能利用者ID
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
              className="mt-2 w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-base outline-none focus:border-violet-500 disabled:bg-slate-100"
            />
          </label>

          <label className="mt-4 block text-sm font-bold text-slate-800">
            パスワード
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
              className="mt-2 w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-base outline-none focus:border-violet-500 disabled:bg-slate-100"
            />
          </label>

          {errorMessage && (
            <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {errorMessage}
            </p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={close}
              className="min-h-12 rounded-2xl bg-slate-100 px-4 py-3 font-bold text-slate-700 disabled:opacity-50"
            >
              キャンセル
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => void authenticate()}
              className="min-h-12 rounded-2xl bg-violet-600 px-4 py-3 font-bold text-white disabled:bg-slate-300"
            >
              {loading ? "認証中..." : "認証する"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
