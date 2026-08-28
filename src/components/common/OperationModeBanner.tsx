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
  const inspection = status.mode === "INSPECTION";
  return <div className={`print:hidden px-4 py-3 text-center text-sm font-black text-white ${inspection ? "bg-amber-600" : "bg-rose-700"}`}>
    {inspection ? "点検モード" : "メンテナンス中"}：{status.message || (inspection ? "管理者が動作確認を行っています。" : "一般操作を一時停止しています。")}
  </div>;
}
