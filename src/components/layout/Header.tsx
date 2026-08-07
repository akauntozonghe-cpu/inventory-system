"use client";

import Link from "next/link";

type Props = {
  title?: string;
};

export default function Header({
  title = "Inventory OS",
}: Props) {
  return (
    <header className="sticky top-0 z-50 border-b bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div>
          <h1 className="text-2xl font-bold">
            {title}
          </h1>

          <p className="text-xs text-gray-500">
            Inventory Management System
          </p>
        </div>

        <div className="flex items-center gap-3">

          <Link
            href="/"
            className="rounded-lg px-4 py-2 hover:bg-gray-100"
          >
            🏠 ホーム
          </Link>

          <Link
            href="/admin"
            className="rounded-lg px-4 py-2 hover:bg-gray-100"
          >
            🔒 管理
          </Link>

        </div>
      </div>
    </header>
  );
}