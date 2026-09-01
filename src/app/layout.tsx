import type { Metadata } from "next";
import LogoutButton from "@/components/auth/LogoutButton";
import OperationModeBanner from "@/components/common/OperationModeBanner";
import IdleSessionGuard from "@/components/auth/IdleSessionGuard";
import PwaManager from "@/components/pwa/PwaManager";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inventory OS",
  description: "保管在庫・棚卸・期限・フリマをまとめて管理するInventory OS",
  applicationName: "Inventory OS",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Inventory OS" },
  formatDetection: { telephone: false },
  icons: { icon: [{ url: "/pwa/icon-192?v=3", type: "image/png", sizes: "192x192" }], apple: [{ url: "/pwa/icon-192?v=3", type: "image/png", sizes: "192x192" }] },
};

export const viewport = { themeColor: "#0f172a", colorScheme: "light" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="bg-slate-100 text-slate-900">
        <OperationModeBanner />
        <IdleSessionGuard />
        <PwaManager />
        <LogoutButton />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
