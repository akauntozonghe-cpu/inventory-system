import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inventory OS",
    short_name: "在庫管理",
    description: "保管在庫・棚卸・期限・フリマをまとめて管理します。",
    start_url: "/",
    scope: "/",
    // Existing installs previously used start_url as their identity.
    // Keep the same identity so an update is not offered as a second app.
    id: "/",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#0f172a",
    lang: "ja",
    orientation: "any",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/pwa/icon-192?v=3", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512?v=3", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512?v=3", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "棚卸を開始", short_name: "棚卸", url: "/stocktake", icons: [{ src: "/pwa/icon-192?v=3", sizes: "192x192", type: "image/png" }] },
      { name: "商品を検索", short_name: "商品検索", url: "/items", icons: [{ src: "/pwa/icon-192?v=3", sizes: "192x192", type: "image/png" }] },
      { name: "期限管理", short_name: "期限", url: "/expiry", icons: [{ src: "/pwa/icon-192?v=3", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
