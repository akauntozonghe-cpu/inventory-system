import { ReactNode } from "react";
import Header from "./Header";

type Props = {
  children: ReactNode;
  title?: string;
};

export default function MainLayout({
  children,
  title,
}: Props) {
  return (
    <>
      <Header title={title} />

      <main className="min-h-screen bg-gray-100">
        <div className="mx-auto max-w-7xl p-6">
          {children}
        </div>
      </main>
    </>
  );
}