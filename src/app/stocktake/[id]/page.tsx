"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import SessionCard from "@/components/stocktake/SessionCard";
import BarcodeSearch from "@/components/stocktake/BarcodeSearch";
import ProductCard from "@/components/stocktake/ProductCard";
import ProgressCard from "@/components/stocktake/ProgressCard";
import BarcodeScanner from "@/components/stocktake/BarcodeScanner";

type Session = {
  id: string;
  title: string;
  operator: string;
  status: string;
  createdAt: string;
};

type InventoryItem = {
  id: string;
  name: string;
  janCode: string | null;
  quantity: number;
};

type Progress = {
  total: number;
  completed: number;
  remaining: number;
  percent: number;
};

export default function StocktakePage() {
  const params = useParams();
  const id = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [barcode, setBarcode] = useState("");
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [quantity, setQuantity] = useState(1);

  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inputMode, setInputMode] = useState<"manual" | "camera">("manual");

  const [progress, setProgress] = useState<Progress>({
    total: 0,
    completed: 0,
    remaining: 0,
    percent: 0,
  });

  useEffect(() => {
    if (id) {
      loadSession();
      loadProgress();
    }
  }, [id]);

  async function loadSession() {
    try {
      const res = await fetch(`/api/stocktake/session/${id}`);

      if (!res.ok) {
        throw new Error();
      }

      const data = await res.json();
      setSession(data);
    } catch (error) {
      console.error(error);
      alert("棚卸データを取得できませんでした");
    } finally {
      setLoading(false);
    }
  }

  async function loadProgress() {
    try {
      const res = await fetch(
        `/api/stocktake/session/${id}/progress`
      );

      if (!res.ok) return;

      const data = await res.json();
      setProgress(data);
    } catch (error) {
      console.error(error);
    }
  }

  async function searchBarcode(scanCode?: string) {
    const target = scanCode ?? barcode;

if (!target) return;

setSearching(true);

    try {
      const res = await fetch(
        `/api/inventory/search?barcode=${encodeURIComponent(target)}`
      );

      if (!res.ok) {
        setItem(null);
        alert("商品が見つかりません");
        return;
      }

      const data = await res.json();

      setItem(data);

      if (typeof data.quantity === "number") {
        setQuantity(data.quantity);
      } else {
        setQuantity(1);
      }
    } catch (error) {
      console.error(error);
      alert("検索に失敗しました");
    } finally {
      setSearching(false);
    }
  }

  async function saveStocktake() {
    if (!item || !session) return;

    setSaving(true);

    try {
      const res = await fetch("/api/stocktake/record", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: session.id,
          inventoryInstanceId: item.id,
          countedQuantity: quantity,
          memo: "",
        }),
      });

      if (!res.ok) {
        throw new Error();
      }

      await loadProgress();

      alert("棚卸を保存しました。");

      setBarcode("");
      setItem(null);
      setQuantity(1);
    } catch (error) {
      console.error(error);
      alert("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

    if (loading) {
    return <main className="p-6">読み込み中...</main>;
  }

  if (!session) {
    return <main className="p-6">セッションが見つかりません。</main>;
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <SessionCard
        title={session.title}
        operator={session.operator ?? "管理者"}
        status={session.status}
        createdAt={session.createdAt}
      />

      <div className="flex gap-3">
  <button
    onClick={() => setInputMode("manual")}
    className={`flex-1 rounded-lg py-3 font-bold transition ${
      inputMode === "manual"
        ? "bg-blue-600 text-white"
        : "bg-gray-200 text-gray-700"
    }`}
  >
    ⌨ 手入力
  </button>

  <button
    onClick={() => setInputMode("camera")}
    className={`flex-1 rounded-lg py-3 font-bold transition ${
      inputMode === "camera"
        ? "bg-green-600 text-white"
        : "bg-gray-200 text-gray-700"
    }`}
  >
    📷 カメラ
  </button>
</div>

{inputMode === "manual" && (
  <BarcodeSearch
    barcode={barcode}
    searching={searching}
    onBarcodeChange={setBarcode}
    onSearch={searchBarcode}
  />
)}

{inputMode === "camera" && (
  <div className="border rounded-xl p-6 shadow bg-white">
    <h2 className="text-xl font-bold mb-3">
      📷 バーコード読み取り
    </h2>

    <BarcodeScanner
  onDetected={async (code) => {
    setBarcode(code);
    await searchBarcode(code);
  }}
/>

    <p className="mt-4 text-green-600 font-semibold">
      🟢 読み取り待機中
    </p>

    <p className="text-gray-500 text-sm mt-1">
      バーコードをカメラへ向けてください。
    </p>
  </div>
)}

      {item && (
        <ProductCard
          item={item}
          quantity={quantity}
          saving={saving}
          onQuantityChange={setQuantity}
          onSave={saveStocktake}
        />
      )}

      <ProgressCard
        total={progress.total}
        completed={progress.completed}
        remaining={progress.remaining}
        percent={progress.percent}
      />
    </main>
  );
}