"use client";

import { Search, X } from "lucide-react";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export default function SearchBar({
  value,
  onChange,
  placeholder = "検索...",
  className = "",
}: SearchBarProps) {
  return (
    <div className={`relative w-full max-w-md ${className}`}>
      <Search
        size={18}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
      />

      <input
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="search-field min-h-12 w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-12 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
      />

      {value !== "" && (
        <button
          type="button"
          aria-label="検索条件をクリア"
          onClick={() => onChange("")}
          className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
