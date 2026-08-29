"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [checkingMode, setCheckingMode] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const checkMode = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await response.json()) as { mustChangePassword?: boolean };
        if (!cancelled && response.ok) setResetMode(data.mustChangePassword === true);
      } catch {
        // API側でも再設定モードを検証するため、表示確認の失敗だけでは処理を止めない
      } finally {
        if (!cancelled) setCheckingMode(false);
      }
    };
    void checkMode();
    return () => { cancelled = true; };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("新しいパスワードが一致していません。");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = (await response.json()) as {
        code?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(
          `${data.code ?? "PASSWORD_CHANGE_FAILED"}: ${
            data.message ?? "パスワードを変更できませんでした。"
          }`
        );
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "PASSWORD_CHANGE_FAILED: パスワードを変更できませんでした。"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-5">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <p className="text-sm font-bold tracking-widest text-blue-600">
          INVENTORY OS
        </p>

        <h1 className="mt-2 text-3xl font-black">
          {resetMode ? "新しいパスワードの設定" : "パスワード変更"}
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          {resetMode
            ? "仮パスワードでの本人確認は完了しています。新しいパスワードを設定してください。"
            : "安全のため、現在のパスワードを確認してから新しいパスワードへ変更します。"}
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
          {!resetMode && (
            <label className="block font-bold">
              現在のパスワード
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
                autoComplete="current-password"
                required
              />
            </label>
          )}

          <label className="block font-bold">
            新しいパスワード
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
              placeholder="10文字以上"
              autoComplete="new-password"
              minLength={10}
              required
            />
          </label>

          <label className="block font-bold">
            新しいパスワード（確認）
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
              autoComplete="new-password"
              minLength={10}
              required
            />
          </label>

          <button
            type="submit"
            disabled={saving || checkingMode}
            className="w-full rounded-xl bg-blue-600 py-3.5 font-black text-white transition hover:bg-blue-700 disabled:bg-slate-400"
          >
            {checkingMode
              ? "確認中..."
              : saving
                ? "設定中..."
                : resetMode
                  ? "新しいパスワードを設定する"
                  : "パスワードを変更する"}
          </button>
        </form>
      </section>
    </main>
  );
}
