"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import BarcodeInput from "@/components/BarcodeInput";
import BarcodeScanner from "@/components/BarcodeScanner";

import SearchResult, {
  SearchItem,
} from "@/components/SearchResult";

import ProgressCard from "@/components/ProgressCard";
import ItemCard from "@/components/ItemCard";

type StorageLocation = {
  id: string;
  name: string;
};

export default function StocktakePage() {
  // バーコード入力欄
  const lastCodeRef = useRef("");
  const lastReadTimeRef = useRef(0);
  const barcodeRef =
    useRef<HTMLInputElement>(null);

  // バーコード検索
  const [keyword, setKeyword] =
    useState("");

  // 検索結果
  const [results, setResults] =
    useState<SearchItem[]>([]);

  // 選択中の商品
  const [selectedItem, setSelectedItem] =
    useState<SearchItem | null>(null);

  // 数量
  const [quantity, setQuantity] =
    useState(0);

  // 保管場所
  const [
    storageLocations,
    setStorageLocations,
  ] = useState<StorageLocation[]>([]);

  const [
    storageLocationId,
    setStorageLocationId,
  ] = useState("");

  // 保存中
  const [saving, setSaving] =
    useState(false);

  // 進捗
  const [completedCount, setCompletedCount] =
    useState(0);

  const [totalCount, setTotalCount] =
    useState(0);

  // カメラ
  const [cameraOpen, setCameraOpen] =
    useState(false);

  // エラーメッセージ
  const [errorMessage, setErrorMessage] =
    useState("");
  // 読み取り状態
  const [scanStatus, setScanStatus] =
    useState("🟢 読み取り待機中");

  useEffect(() => {
    loadLocations();
    loadTotal();
  }, []);

  async function loadLocations() {
    const res =
      await fetch("/api/storage-locations");

    const data =
      await res.json();

    setStorageLocations(data);

    if (data.length > 0) {
      setStorageLocationId(data[0].id);
    }
  }

  async function loadTotal() {
    const res =
      await fetch("/api/inventory");

    const data =
      await res.json();

    setTotalCount(data.length);
  }

  async function search(
  value: string
): Promise<boolean> {
  setKeyword(value);

  if (!value.trim()) {
    setResults([]);
    setSelectedItem(null);
    setErrorMessage("");
    return false;
  }

  const res = await fetch(
    `/api/inventory/search?q=${encodeURIComponent(
      value
    )}`
  );

  if (!res.ok) {
    setResults([]);
    setSelectedItem(null);
    setErrorMessage(
      "検索に失敗しました。"
    );
    return false;
  }

  const data: SearchItem[] =
    await res.json();

  setResults(data);

  // 見つからない
  if (data.length === 0) {
    setSelectedItem(null);

    setErrorMessage(
      "登録されていないバーコードです。登録済みの商品を読み取ってください。"
    );

    return false;
  }

  // エラー解除
  setErrorMessage("");

  // 1件だけなら自動選択
  if (data.length === 1) {
    const item = data[0];

    setKeyword(item.item.name);

    setSelectedItem(item);

    setQuantity(item.quantity);

    setStorageLocationId(
      item.storageLocation?.id ?? ""
    );

    setResults([]);

    // 数量入力へフォーカス
    requestAnimationFrame(() => {
      const input =
        document.querySelector(
          'input[type="number"]'
        ) as HTMLInputElement | null;

      input?.focus();
      input?.select();
    });

    return true;
  }

  return true;
}

  // カメラで読み取った時
const handleBarcodeDetected =
  useCallback(async (code: string) => {
    const found = await search(code);
    if (!found) {
  setScanStatus("🔴 未登録バーコード");
  return;
}

setScanStatus("✅ 読み取り成功");

setTimeout(() => {
  setScanStatus("🟢 読み取り待機中");
}, 1200);
    if (!found) {
      return;
    }

    setCameraOpen(false);
  }, []);

  async function save() {
  if (!selectedItem) {
    alert("商品を選択してください");
    return;
  }

  if (!storageLocationId) {
    alert("保管場所を選択してください");
    return;
  }

  setSaving(true);

  try {
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemId: selectedItem.item.id,
        quantity,
        actualQuantity: quantity,
        storageLocationId,
        lotNo: selectedItem.lotNo,
        expirationDate:
          selectedItem.expirationDate,
        allocationType: "home",
        status: "保管中",
      }),
    });

    if (!res.ok) {
      throw new Error();
    }

    setCompletedCount((c) => c + 1);

    // 入力内容を初期化
    setKeyword("");
    setResults([]);
    setSelectedItem(null);
    setQuantity(0);
    setErrorMessage("");

    await loadTotal();

    // PC運用ならバーコード入力へ戻す
    if (!cameraOpen) {
      requestAnimationFrame(() => {
        barcodeRef.current?.focus();
      });
    }

  } catch (error) {
    console.error(error);
    alert("保存に失敗しました");
  } finally {
    setSaving(false);
  }
}

    return (
    <div className="max-w-6xl mx-auto p-8 space-y-6">

      <ProgressCard
        completed={completedCount}
        total={totalCount}
      />
      <div
  className={`rounded-xl p-4 text-center text-lg font-bold transition-all ${
    scanStatus.startsWith("✅")
      ? "bg-green-100 text-green-700 border border-green-400"
      : scanStatus.startsWith("🔴")
      ? "bg-red-100 text-red-700 border border-red-400"
      : "bg-blue-100 text-blue-700 border border-blue-300"
  }`}
>
  {scanStatus}
</div>
      <BarcodeInput
        ref={barcodeRef}
        value={keyword}
        onChange={search}
        onEnter={() => {
          if (results.length > 0) {
            const item = results[0];

            setSelectedItem(item);

            setQuantity(item.quantity);

            setStorageLocationId(
              item.storageLocation?.id ?? ""
            );

            setKeyword(item.item.name);

            setResults([]);

            setErrorMessage("");

            requestAnimationFrame(() => {
              const input =
                document.querySelector(
                  'input[type="number"]'
                ) as HTMLInputElement | null;

              input?.focus();
              input?.select();
            });
          }
        }}
      />

      {/* エラーメッセージ */}
      {errorMessage && (
        <div className="rounded-xl border-2 border-red-500 bg-red-50 p-5 shadow">

          <div className="flex items-start gap-3">

            <div className="text-4xl">
              ⚠️
            </div>

            <div className="flex-1">

              <div className="text-lg font-bold text-red-700">
                バーコードが登録されていません
              </div>

              <div className="mt-2 text-red-600">
                登録済み商品のバーコードを読み取ってください。
              </div>

              <div className="mt-2 text-sm text-gray-600">
                カメラはそのまま使用できます。
              </div>

            </div>

          </div>

        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            setCameraOpen((prev) => !prev)
          }
          className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700 transition"
        >
          {cameraOpen
            ? "📷 カメラを閉じる"
            : "📷 カメラで読み取る"}
        </button>
      </div>

      {cameraOpen && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
        />
      )}

      <SearchResult
        items={results}
        onSelect={(item) => {
          setSelectedItem(item);

          setQuantity(item.quantity);

          setStorageLocationId(
            item.storageLocation?.id ?? ""
          );

          setKeyword(item.item.name);

          setResults([]);

          setErrorMessage("");

          requestAnimationFrame(() => {
            const input =
              document.querySelector(
                'input[type="number"]'
              ) as HTMLInputElement | null;

            input?.focus();
            input?.select();
          });
        }}
      />
      <ItemCard
        item={selectedItem}
        quantity={quantity}
        onQuantityChange={setQuantity}
        storageLocations={storageLocations}
        storageLocationId={storageLocationId}
        onLocationChange={setStorageLocationId}
        saving={saving}
        onSave={save}
      />

    </div>
  );
}