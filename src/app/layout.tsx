import PermissionProvider from "@/components/pwa/PermissionProvider";
import PermissionNotice from "@/components/pwa/PermissionNotice";
import PageNavigation from "@/components/common/PageNavigation";
import DevicePushSession from "@/components/pwa/DevicePushSession";
import PageAdminMode from "@/components/auth/PageAdminMode";
import ScanAudioInitializer from "@/components/ScanAudioInitializer";
import type { Metadata } from "next";
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
  icons: { icon: [{ url: "/pwa/icon-192?v=4", type: "image/png", sizes: "192x192" }], apple: [{ url: "/pwa/icon-192?v=4", type: "image/png", sizes: "192x192" }] },
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
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:rounded-xl focus:bg-white focus:p-4 focus:font-bold focus:text-blue-800">本文へ移動</a>
        <OperationModeBanner />
        <IdleSessionGuard />
        <DevicePushSession />
        <ScanAudioInitializer />
        <PageAdminMode><PermissionProvider><PageNavigation/><PermissionNotice/><div id="main-content" tabIndex={-1} className="min-h-screen" style={{paddingBottom:"var(--app-footer-height, 4rem)"}}>{children}</div><PwaManager /></PermissionProvider></PageAdminMode>
      </body>
    </html>
  );
}
