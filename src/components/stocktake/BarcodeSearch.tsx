"use client";

import {
  forwardRef,
  KeyboardEvent,
} from "react";

type Props = {
  barcode: string;

  searching: boolean;

  onBarcodeChange: (
    value: string
  ) => void;

  onSearch: () => void;

  onKeyDown?: (
    e: KeyboardEvent<HTMLInputElement>
  ) => void;
};

const BarcodeSearch = forwardRef<
  HTMLInputElement,
  Props
>(
  (
    {
      barcode,
      searching,
      onBarcodeChange,
      onSearch,
      onKeyDown,
    },
    ref
  ) => {
    return (
      <div className="rounded-xl border bg-white p-6 shadow">

        <h2 className="mb-4 text-xl font-bold">
          🔍 バーコード検索
        </h2>

        <div className="flex gap-3">

          <input
            ref={ref}
            type="text"
            value={barcode}
            placeholder="JANコードを入力"
            onChange={(e) =>
              onBarcodeChange(
                e.target.value
              )
            }
            onKeyDown={onKeyDown}
            className="flex-1 rounded-lg border p-3"
          />

          <button
            onClick={onSearch}
            disabled={searching}
            className="rounded-lg bg-blue-600 px-6 font-bold text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {searching
              ? "検索中..."
              : "検索"}
          </button>

        </div>

        <p className="mt-3 text-sm text-gray-500">
          Enterで検索・Escで入力をクリアできます。
        </p>

      </div>
    );
  }
);

BarcodeSearch.displayName =
  "BarcodeSearch";

export default BarcodeSearch;