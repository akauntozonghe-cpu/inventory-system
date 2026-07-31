"use client";

import { useEffect, useRef } from "react";

type Props = {
  value: number;
  onChange: (value: number) => void;
  unit?: string | null;

  // 追加
  autoFocus?: boolean;
  onEnter?: () => void;
};

export default function QuantityInput({
  value,
  onChange,
  unit,
  autoFocus = false,
  onEnter,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [autoFocus]);

  function decrease() {
    onChange(Math.max(0, value - 1));
  }

  function increase() {
    onChange(value + 1);
  }

  return (
    <div>
      <label className="block text-sm font-semibold mb-2">
        数量
      </label>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={decrease}
          className="w-14 h-14 rounded-xl bg-gray-200 text-3xl hover:bg-gray-300"
        >
          −
        </button>

        <input
          ref={inputRef}
          type="number"
          min={0}
          inputMode="numeric"
          value={value}
          onChange={(e) =>
            onChange(Number(e.target.value))
          }
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter?.();
            }
          }}
          className="w-40 border rounded-xl text-center text-3xl p-3"
        />

        <button
          type="button"
          onClick={increase}
          className="w-14 h-14 rounded-xl bg-blue-600 text-white text-3xl hover:bg-blue-700"
        >
          ＋
        </button>
      </div>

      <div className="mt-3 text-gray-500">
        単位：{unit ?? "個"}
      </div>
    </div>
  );
}