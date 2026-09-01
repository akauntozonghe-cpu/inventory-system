import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inventory OS",
    short_name: "在庫管理",
    description: "保管在庫・棚卸・期限・フリマをまとめて管理します。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#0f172a",
    lang: "ja",
    orientation: "any",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/pwa-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "棚卸を開始", short_name: "棚卸", url: "/stocktake", icons: [{ src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "商品を検索", short_name: "商品検索", url: "/items", icons: [{ src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "期限管理", short_name: "期限", url: "/expiry", icons: [{ src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml" }] },
    ],
  };
}
