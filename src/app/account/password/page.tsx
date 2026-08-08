"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

        <h1 className="mt-2 text-3xl font-black">パスワード変更</h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          初期パスワードまたは再発行された仮パスワードを、
          あなただけが知る新しいパスワードへ変更してください。
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
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 py-3.5 font-black text-white transition hover:bg-blue-700 disabled:bg-slate-400"
          >
            {saving ? "変更中..." : "パスワードを変更して続ける"}
          </button>
        </form>
      </section>
    </main>
  );
}