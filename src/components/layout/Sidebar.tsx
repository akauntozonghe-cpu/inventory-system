"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Package,
  Boxes,
  ClipboardList,
  History,
  Settings,
} from "lucide-react";

const menus = [
  {
    name: "ホーム",
    href: "/",
    icon: Home,
  },
  {
    name: "商品",
    href: "/items",
    icon: Package,
  },
  {
    name: "在庫",
    href: "/inventory",
    icon: Boxes,
  },
  {
    name: "棚卸",
    href: "/stocktake",
    icon: ClipboardList,
  },
  {
    name: "履歴",
    href: "/history",
    icon: History,
  },
  {
    name: "設定",
    href: "/settings",
    icon: Settings,
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-white shadow-sm">
      <div className="border-b p-6">
        <h1 className="text-2xl font-bold text-blue-600">
          Inventory OS
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          在庫管理システム
        </p>
      </div>

      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {menus.map((menu) => {
            const Icon = menu.icon;

            const active =
              pathname === menu.href;

            return (
              <Link
                key={menu.href}
                href={menu.href}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 transition ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Icon size={20} />
                <span>{menu.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t p-4 text-center text-xs text-gray-400">
        Inventory OS v1.0
      </div>
    </aside>
  );
}