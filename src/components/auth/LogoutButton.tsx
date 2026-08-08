"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (pathname === "/login") {
    return null;
  }

  const logout = async () => {
    setLoading(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className="fixed bottom-4 right-4 z-50 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg ring-1 ring-white/20 transition hover:bg-slate-700 disabled:opacity-60"
    >
      {loading ? "ログアウト中..." : "ログアウト"}
    </button>
  );
}
