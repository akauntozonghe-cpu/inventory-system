import Link from "next/link";

const menus = [
  {
    href: "/items",
    icon: "📦",
    title: "商品管理",
  },
  {
    href: "/inventory",
    icon: "📋",
    title: "在庫管理",
  },
  {
    href: "/stocktake",
    icon: "📝",
    title: "棚卸",
  },
  {
    href: "/history",
    icon: "📈",
    title: "履歴",
  },
  {
    href: "/locations",
    icon: "📍",
    title: "保管場所",
  },
  {
    href: "/settings",
    icon: "⚙",
    title: "設定",
  },
];

export default function QuickMenu() {
  return (
    <div className="rounded-2xl bg-white border shadow p-6">

      <h2 className="text-xl font-bold mb-5">
        🚀 クイックメニュー
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

        {menus.map((menu) => (
          <Link
            key={menu.href}
            href={menu.href}
            className="rounded-xl border p-5 text-center hover:bg-blue-50 transition"
          >
            <div className="text-4xl">
              {menu.icon}
            </div>

            <div className="mt-2 font-semibold">
              {menu.title}
            </div>
          </Link>
        ))}

      </div>

    </div>
  );
}