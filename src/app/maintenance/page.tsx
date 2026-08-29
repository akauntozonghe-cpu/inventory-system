"use client";

import { useEffect, useState } from "react";

export default function MaintenancePage() {
  const [message, setMessage] = useState("安全な状態を確認しています。");
  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/system-status", { cache: "no-store" });
        if (!response.ok) return;
        const status = await response.json();
        if (status.mode !== "MAINTENANCE") { window.location.replace("/"); return; }
        setMessage(status.message || "現在、管理者が保守・復旧作業を行っています。しばらくしてから自動的に再確認します。");
      } catch {
        // 保守中の通信断では画面を維持し、次回の自動確認で復旧する。
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-white"><section className="w-full max-w-xl rounded-3xl bg-white p-8 text-center text-slate-950 shadow-2xl"><p className="text-sm font-black text-rose-700">MAINTENANCE</p><h1 className="mt-2 text-3xl font-black">ただいまメンテナンス中です</h1><p className="mt-5 leading-7 text-slate-700">{message}</p><p className="mt-5 rounded-xl bg-slate-100 p-3 text-sm font-bold text-slate-600">画面は30秒ごとに自動確認し、復旧後に通常画面へ戻ります。</p></section></main>;
}
