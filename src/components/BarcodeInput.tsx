"use client";

import { forwardRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
};

const BarcodeInput = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, onEnter }, ref) => {
    return (
      <input
        ref={ref}
        type="text"
        value={value}
        placeholder="バーコード・商品名・JAN・管理コードを入力"
        autoFocus
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        className="w-full rounded-2xl border border-gray-300 bg-black text-white px-6 py-5 text-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-200"
      />
    );
  }
);

BarcodeInput.displayName = "BarcodeInput";

export default BarcodeInput;