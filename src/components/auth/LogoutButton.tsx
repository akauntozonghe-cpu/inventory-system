"use client";
import { leaveCurrentStocktakes } from "@/hooks/useStocktakePresence";
import { detachDevicePush } from "@/lib/device-push-client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (pathname === "/login" || pathname === "/") {
    return null;
  }

  const logout = async () => {
    setLoading(true);

    try {
      await leaveCurrentStocktakes(); await detachDevicePush(); await fetch("/api/auth/logout", { method: "POST" });
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
      aria-label={loading ? "ログアウト中" : "ログアウト"}
      title="ログアウト"
      className="fixed bottom-4 right-4 z-50 grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white/90 text-slate-600 shadow-[0_10px_35px_rgba(15,23,42,.16)] backdrop-blur transition hover:bg-slate-950 hover:text-white disabled:opacity-60"
    >
      <LogOut size={19} className={loading ? "animate-pulse" : ""} />
    </button>
  );
}
