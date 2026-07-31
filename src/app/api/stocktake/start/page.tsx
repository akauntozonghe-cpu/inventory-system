"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StocktakeStartPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [operator, setOperator] = useState("管理者");
  const [loading, setLoading] = useState(false);

  async function startStocktake() {
    setLoading(true);

    try {
      const res = await fetch("/api/stocktake/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          operator,
        }),
      });

      if (!res.ok) {
        throw new Error("棚卸開始に失敗しました");
      }

      const session = await res.json();

      router.push(`/stocktake/${session.id}`);
    } catch (err) {
      console.error(err);
      alert("棚卸開始に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">棚卸開始</h1>

      <div>
        <label className="block mb-2">棚卸名</label>
        <input
          className="border rounded w-full p-2"
          placeholder="例：2026年7月棚卸"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <label className="block mb-2">担当者</label>
        <input
          className="border rounded w-full p-2"
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
        />
      </div>

      <button
        onClick={startStocktake}
        disabled={loading}
        className="w-full rounded bg-blue-600 text-white py-3 disabled:opacity-50"
      >
        {loading ? "開始中..." : "棚卸開始"}
      </button>
    </main>
  );
}