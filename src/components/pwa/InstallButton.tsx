"use client";
export default function InstallButton() {
  return <button type="button" onClick={() => window.dispatchEvent(new Event("inventory-install-request"))}
    className="my-4 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white">この端末のホーム画面に追加</button>;
}
