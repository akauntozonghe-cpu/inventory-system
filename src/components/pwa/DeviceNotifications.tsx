"use client";
import { useEffect, useState } from "react";
import { PUSH_ENABLED, supportsDevicePush, pushRegistration, saveDevicePush, detachDevicePush } from "@/lib/device-push-client";

export default function DeviceNotifications() {
  const [supported,setSupported] = useState(false), [ready,setReady] = useState(false), [admin,setAdmin] = useState(false), [enabled,setEnabled] = useState(false), [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  const [publicKey,setPublicKey] = useState("");
  const load = async () => {
    const response = await fetch("/api/notifications/device", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const value = await response.json(); if (!response.ok) throw new Error(`${value.code}：${value.message}`);
    setReady(value.ready);setAdmin(value.isAdmin);setPublicKey(value.publicKey ?? "");
  };
  useEffect(() => { setSupported(supportsDevicePush()); void load().catch(error => setMessage(error.message));
    if (supportsDevicePush()) void navigator.serviceWorker.getRegistration().then(async registration => { const sub = await registration?.pushManager.getSubscription(); setEnabled(Boolean(sub) && Notification.permission === "granted"); });
  }, []);
  const act = async (action: "SETUP" | "ENABLE" | "DISABLE" | "TEST") => {
    setBusy(true);setMessage("");
    try {
      if (action === "SETUP") {
        const response=await fetch("/api/notifications/device",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"SETUP"}),signal:AbortSignal.timeout(10000)});const value=await response.json();if(!response.ok)throw new Error(`${value.code}：${value.message}`);setMessage(value.message);await load();
      } else if (action === "DISABLE") { await detachDevicePush(true);localStorage.removeItem(PUSH_ENABLED);setEnabled(false);setMessage("この端末の通知を停止しました。"); }
      else {
        // Permission is requested only in response to this explicit button click.
        if (Notification.permission !== "granted" && await Notification.requestPermission() !== "granted") throw new Error("PUSH_PERMISSION：通知が許可されていません。ブラウザ・端末の通知設定を確認してください。");
        const registration = await pushRegistration();
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const bytes = Uint8Array.from(atob(publicKey.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));
          subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        }
        setMessage(await saveDevicePush(subscription, action === "TEST" ? "TEST" : "SUBSCRIBE"));localStorage.setItem(PUSH_ENABLED,"1");setEnabled(true);
      }
    } catch (error) { setMessage(error instanceof Error ? (error.message.includes("PUSH_") ? error.message : "PUSH_FAILED："+error.message) : "PUSH_FAILED：通知を設定できませんでした。"); } finally { setBusy(false); }
  };
  return <section className="my-4 rounded-2xl border bg-white p-4" aria-label="端末への通知"><h2 className="text-lg font-black">この端末への通知</h2><p className="my-2 text-sm">アプリを閉じていても、新しい通知を端末の通知欄へ届けます。内容はログイン後に確認できます。ログアウト中は停止し、次回ログイン時に再接続します。</p>{!supported&&<p className="my-2 text-sm">この環境では端末通知を利用できません。対応するブラウザ、またはホーム画面に追加したアプリで開いてください。通知一覧はそのまま使えます。</p>}{!ready&&<p className="my-2 text-sm">管理者による初回の通知準備が必要です。</p>}<div className="flex flex-wrap gap-2">{admin&&!ready&&<button disabled={busy} className="rounded-xl border p-3 font-bold" onClick={()=>void act("SETUP")}>端末通知を準備する</button>}{supported&&ready&&<><button disabled={busy} className="rounded-xl bg-blue-700 p-3 font-bold text-white" onClick={()=>void act(enabled?"DISABLE":"ENABLE")}>{enabled?"この端末の通知を停止":"この端末の通知を許可"}</button>{enabled&&<button disabled={busy} className="rounded-xl border p-3 font-bold" onClick={()=>void act("TEST")}>テスト通知を送る</button>}</>}</div>{message&&<p role="status" className="mt-3 text-sm">{message}</p>}</section>;
}
