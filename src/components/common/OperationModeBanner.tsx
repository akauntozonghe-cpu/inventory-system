"use client";

import { useEffect, useState } from "react";

export default function OperationModeBanner() {
  const [status, setStatus] = useState<{ mode: string; message: string | null } | null>(null);
  useEffect(() => {
    const load = () => fetch("/api/system-status", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then(setStatus).catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!status || status.mode === "NORMAL") return null;
  const testMode = status.mode === "TEST";
  return <div className={`print:hidden px-4 py-3 text-center text-sm font-black text-white ${testMode ? "bg-violet-700" : "bg-rose-700"}`}>
    {testMode ? "テストモード" : "メンテナンス中"}：{status.message || (testMode ? "本番データを確定せず、機能の完了直前まで動作確認します。" : "一般利用を停止し、管理者が保守・復旧を行っています。")}
  </div>;
}
