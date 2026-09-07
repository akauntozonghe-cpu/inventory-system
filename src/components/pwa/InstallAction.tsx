"use client";
import { useSyncExternalStore } from "react";
import { getInstallState, getServerInstallState, requestNativeInstall, subscribeInstall, type InstallState } from "@/lib/pwa-install-prompt";

const messages: Record<InstallState, string> = {
  waiting: "このブラウザから追加画面の準備完了が届いていません。下の手順と「この端末の状態を確認」を使ってください。準備できると追加ボタンが使えるようになります。",
  ready: "この端末に追加できます。下のボタンからChromeなどの確認画面を開きます。",
  busy: "ブラウザの確認画面を開いています。応答がない場合は15秒で案内に戻ります。",
  accepted: "ブラウザが追加を受け付けました。ホーム画面またはアプリ一覧の「在庫管理」「Inventory OS」を確認してください。",
  dismissed: "追加をキャンセルしました。再度試す場合はページを開き直すか、ブラウザのメニューを使ってください。",
  failed: "ブラウザの追加画面を開けませんでした。下の状態確認と手順を確認してください。",
  timeout: "ブラウザから応答がありませんでした。追加できたとは確認できていません。下の状態確認を使ってください。",
  installed: "アプリとして起動中、または追加が完了しています。ホーム画面・アプリ一覧から起動できます。",
};
export default function InstallAction() {
  const state = useSyncExternalStore(subscribeInstall, getInstallState, getServerInstallState);
  return <section className="my-5 rounded-2xl border border-blue-200 bg-blue-50 p-5" aria-labelledby="install-action-title">
    <h2 id="install-action-title" className="text-lg font-black">この端末への追加</h2>
    <p role="status" className="my-3 leading-7">{messages[state]}</p>
    <button type="button" disabled={state !== "ready"} onClick={() => void requestNativeInstall()} className="min-h-12 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:bg-slate-300 disabled:text-slate-700">{state === "busy" ? "ブラウザの応答を待っています…" : "インストール画面を開く"}</button>
  </section>;
}
