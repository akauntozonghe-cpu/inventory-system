"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Home() {
  const router = useRouter();

  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [masterPass, setMasterPass] = useState("2580");

useEffect(() => {
  const saved = localStorage.getItem("adminPass");

  if (saved) {
    setMasterPass(saved);
  } else {
    localStorage.setItem("adminPass", "2580");
  }
}, []);

  const loginAdmin = () => {
    if (adminPass === masterPass) {
      setAdminOpen(false);
      setAdminPass("");
      router.push("/admin");
    } else {
      alert("パスコードが違います");
      setAdminPass("");
    }
  };

  return (
    <main className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto p-8">
        <div className="mb-10">
          <h1
            onDoubleClick={() => setAdminOpen(true)}
            className="text-5xl font-bold cursor-pointer select-none"
          >
            Inventory OS
          </h1>

          <p className="text-gray-500 mt-2">
            棚卸システム v1.0
          </p>
        </div>

        <div className="grid gap-6">
          <Link
            href="/import"
            className="bg-white rounded-2xl shadow p-8 hover:shadow-lg transition"
          >
            <div className="text-5xl mb-4">📥</div>

            <div className="text-2xl font-bold">
              初回インポート
            </div>

            <div className="text-gray-500 mt-2">
              管理表Excelを読み込みます
            </div>
          </Link>

          <Link
            href="/stocktake"
            className="bg-white rounded-2xl shadow p-8 hover:shadow-lg transition"
          >
            <div className="text-5xl mb-4">📋</div>

            <div className="text-2xl font-bold">
              棚卸
            </div>

            <div className="text-gray-500 mt-2">
              バーコードで棚卸を行います
            </div>
          </Link>

          <Link
            href="/settings"
            className="bg-white rounded-2xl shadow p-8 hover:shadow-lg transition"
          >
            <div className="text-5xl mb-4">⚙</div>

            <div className="text-2xl font-bold">
              設定
            </div>

            <div className="text-gray-500 mt-2">
              保管場所・システム設定
            </div>
          </Link>
        </div>
      </div>

      {adminOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <h2 className="text-xl font-bold mb-4">
              🔒 管理者認証
            </h2>

            <input
              type="password"
              value={adminPass}
              onChange={(e) => setAdminPass(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  loginAdmin();
                }
              }}
              placeholder="パスコード"
              className="w-full border rounded-lg p-3"
              autoFocus
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setAdminOpen(false);
                  setAdminPass("");
                }}
                className="px-4 py-2 rounded-lg border"
              >
                キャンセル
              </button>

              <button
                onClick={loginAdmin}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}