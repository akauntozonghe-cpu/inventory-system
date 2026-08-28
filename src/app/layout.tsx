import type { Metadata } from "next";
import LogoutButton from "@/components/auth/LogoutButton";
import OperationModeBanner from "@/components/common/OperationModeBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inventory OS",
  description: "Inventory Operating System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="bg-slate-100 text-slate-900">
        <OperationModeBanner />
        <LogoutButton />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
