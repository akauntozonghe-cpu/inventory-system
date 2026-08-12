"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type CurrentUser = {
  id: string;
  role: "ADMIN" | "WORKER";
};

function getMessage(value: unknown, fallback: string) {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }

  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      `サーバーから応答がありません。HTTP ${response.status}`
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `正しい応答を取得できませんでした。HTTP ${response.status}`
    );
  }
}

function isCurrentUser(value: unknown): value is CurrentUser {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "role" in value &&
    typeof value.id === "string" &&
    (value.role === "ADMIN" || value.role === "WORKER")
  );
}

export default function ConflictResolutionPanel({
  sessionId,
}: {
  sessionId: string;
}) {
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        const data = await readJson(response);

        if (!cancelled && response.ok && isCurrentUser(data)) {
          setIsAdmin(data.role === "ADMIN");
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setLoadingUser(false);
        }
      }
    };

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const resolveConflict = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `/api/stocktake/session/${encodeURIComponent(sessionId)}/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            note: note.trim(),
          }),
        }
      );

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(
            data,
            "競合した棚卸を安全終了できませんでした。"
          )
        );
      }

      router.replace("/stocktake/start");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "競合した棚卸を安全終了できませんでした。"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loadingUser || !isAdmin) {
    return null;
  }

  return (
    <section className="mt-4 rounded-3xl border border-slate-300 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-slate-500">
        管理者操作
      </p>

      <h2 className="mt-1 text-xl font-black text-slate-950">
        競合した棚卸を安全終了する
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        在庫数は変更せず、棚卸入力・競合内容・管理者操作ログを保存したまま終了します。
        終了後は、新しい棚卸を開始できます。
      </p>

      {error && (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 rounded-2xl bg-slate-900 px-5 py-3 font-bold text-white transition hover:bg-slate-700"
      >
        安全終了を実行
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-sm font-bold text-red-600">
              管理者確認
            </p>

            <h3 className="mt-1 text-2xl font-black text-slate-950">
              この棚卸を安全終了しますか？
            </h3>

            <p className="mt-4 leading-7 text-slate-700">
              在庫数には反映しません。
              棚卸入力と競合記録は、履歴および管理者ログとして残ります。
            </p>

            <label className="mt-5 block">
              <span className="text-sm font-bold text-slate-700">
                対応メモ（任意）
              </span>

              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="例：入出庫処理と重複したため、再棚卸を実施する"
                className="mt-2 w-full rounded-2xl border border-slate-300 p-3 outline-none focus:border-blue-500"
              />
            </label>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setOpen(false);
                  setError("");
                }}
                className="rounded-2xl bg-slate-100 px-5 py-3 font-bold text-slate-700 disabled:opacity-50"
              >
                戻る
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => void resolveConflict()}
                className="rounded-2xl bg-red-600 px-5 py-3 font-bold text-white disabled:bg-slate-400"
              >
                {saving
                  ? "安全終了しています…"
                  : "在庫を変更せず安全終了する"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}