"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [savedPass, setSavedPass] = useState("2580");

  useEffect(() => {
    const pass = localStorage.getItem("adminPass");

    if (pass) {
      setSavedPass(pass);
    } else {
      localStorage.setItem("adminPass", "2580");
    }
  }, []);

  const save = () => {
    if (currentPass !== savedPass) {
      alert("現在のパスコードが違います。");
      return;
    }

    if (newPass.length < 4) {
      alert("4桁以上で入力してください。");
      return;
    }

    localStorage.setItem("adminPass", newPass);

    alert("パスコードを変更しました。");

    setSavedPass(newPass);
    setCurrentPass("");
    setNewPass("");
  };

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow">

        <h1 className="mb-6 text-3xl font-bold">
          ⚙ システム設定
        </h1>

        <div className="space-y-5">

          <div>
            <label className="mb-2 block font-bold">
              現在のパスコード
            </label>

            <input
              type="password"
              value={currentPass}
              onChange={(e) => setCurrentPass(e.target.value)}
              className="w-full rounded-lg border p-3"
            />
          </div>

          <div>
            <label className="mb-2 block font-bold">
              新しいパスコード
            </label>

            <input
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              className="w-full rounded-lg border p-3"
            />
          </div>

          <button
            onClick={save}
            className="w-full rounded-xl bg-blue-600 py-3 text-white"
          >
            保存
          </button>

        </div>

      </div>
    </main>
  );
}