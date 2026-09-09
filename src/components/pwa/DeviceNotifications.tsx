"use client";
import { useEffect, useState } from "react";
import { PUSH_ENABLED, supportsDevicePush, pushRegistration, saveDevicePush, detachDevicePush } from "@/lib/device-push-client";

export default function DeviceNotifications() {
  const [supported,setSupported] = useState(false), [ready,setReady] = useState(false), [admin,setAdmin] = useState(false), [enabled,setEnabled] = useState(false), [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  const [publicKey,setPublicKey] = useState("");
  const [permission,setPermission]=useState("確認中");
  const load = async () => {
    const response = await fetch("/api/notifications/device", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const value = await response.json(); if (!response.ok) throw new Error(`${value.code}：${value.message}`);
    setReady(value.ready);setAdmin(value.isAdmin);setPublicKey(value.publicKey ?? "");
  };
  useEffect(() => { setSupported(supportsDevicePush());setPermission("Notification" in window?Notification.permission:"unsupported"); void load().catch(error => setMessage(error.message));
    if (supportsDevicePush()) void navigator.serviceWorker.getRegistration().then(async registration => { const sub = await registration?.pushManager.getSubscription(); setEnabled(Boolean(sub) && Notification.permission === "granted"); });
  }, []);
  const act = async (action: "SETUP" | "ENABLE" | "DISABLE" | "TEST" | "LOCAL") => {
    setBusy(true);setMessage("");
    try {
      if (action === "SETUP") {
        const response=await fetch("/api/notifications/device",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"SETUP"}),signal:AbortSignal.timeout(10000)});const value=await response.json();if(!response.ok)throw new Error(`${value.code}：${value.message}`);setMessage(value.message);await load();
      } else if (action === "DISABLE") { await detachDevicePush(true);localStorage.removeItem(PUSH_ENABLED);setEnabled(false);setMessage("この端末の通知を停止しました。"); }
      else {
        // Permission is requested only in response to this explicit button click.
        if (Notification.permission !== "granted" && await Notification.requestPermission() !== "granted") throw new Error("PUSH_PERMISSION：通知が許可されていません。ブラウザ・端末の通知設定を確認してください。");
        const registration = await pushRegistration();
        setPermission(Notification.permission);
        if(action==="LOCAL"){await registration.showNotification("Inventory OS",{body:"この端末で通知を表示できています。",tag:"inventory-local-test",icon:"/pwa/icon-192?v=4"});setMessage("端末表示テストを実行しました。通知欄を確認してください。サーバーからの配信は別途テストします。");return;}
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const bytes = Uint8Array.from(atob(publicKey.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));
          subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        }
        if(action==="TEST")await saveDevicePush(subscription,"SUBSCRIBE");
        setMessage(await saveDevicePush(subscription, action === "TEST" ? "TEST" : "SUBSCRIBE"));localStorage.setItem(PUSH_ENABLED,"1");setEnabled(true);
      }
    } catch (error) { setMessage(error instanceof Error ? (error.message.includes("PUSH_") ? error.message : "PUSH_FAILED："+error.message) : "PUSH_FAILED：通知を設定できませんでした。"); } finally { if("Notification" in window)setPermission(Notification.permission);setBusy(false); }
  };
  return <section className="my-4 rounded-2xl border bg-white p-4" aria-label="端末への通知"><h2 className="text-lg font-black">この端末への通知</h2><p className="my-2 text-sm">アプリを閉じていても、新しい通知を端末の通知欄へ届けます。内容はログイン後に確認できます。ログアウト中は停止し、次回ログイン時に再接続します。</p>{!supported&&<p className="my-2 text-sm">この環境では端末通知を利用できません。対応するブラウザ、またはホーム画面に追加したアプリで開いてください。通知一覧はそのまま使えます。</p>}{!ready&&<p className="my-2 text-sm">管理者による初回の通知準備が必要です。</p>}<p className="my-3 text-sm">通知許可：{permission==="granted"?"許可済み":permission==="denied"?"ブロック中（ブラウザのサイト設定で変更）":permission==="default"?"未設定":permission==="unsupported"?"非対応":"確認中"} ／ サーバー準備：{ready?"準備済み":"未確認・未準備"} ／ この端末：{enabled?"登録あり":"未接続"}</p><div className="flex flex-wrap gap-2">{supported&&<button disabled={busy} className="rounded-xl border p-3 font-bold" onClick={()=>void act("LOCAL")}>端末の通知表示をテスト</button>}{admin&&!ready&&<button disabled={busy} className="rounded-xl border p-3 font-bold" onClick={()=>void act("SETUP")}>端末通知を準備する</button>}{supported&&ready&&<><button disabled={busy} className="rounded-xl bg-blue-700 p-3 font-bold text-white" onClick={()=>void act(enabled?"DISABLE":"ENABLE")}>{enabled?"この端末の通知を停止":"この端末の通知を許可"}</button>{enabled&&<button disabled={busy} className="rounded-xl border p-3 font-bold" onClick={()=>void act("TEST")}>再接続して配信をテスト</button>}</>}</div>{message&&<p role={message.startsWith("PUSH_")?"alert":"status"} className="mt-3 text-sm">{message}</p>}</section>;
}
