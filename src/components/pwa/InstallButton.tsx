"use client";
export default function InstallButton() {
  return <a href="/install" onClick={(event) => {
    // Keep a real navigation fallback if the global PWA handler has not mounted.
    const unhandled = window.dispatchEvent(new Event("inventory-install-request", { cancelable: true }));
    if (!unhandled) event.preventDefault();
  }}
    className="my-4 inline-block rounded-xl bg-blue-700 px-5 py-3 font-bold text-white">この端末のホーム画面に追加</a>;
}
