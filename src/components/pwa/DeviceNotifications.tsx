"use client";
import DevicePermissions from "./DevicePermissions";
import {defaultPushPolicy,notificationTypes,type PushPolicy} from "@/lib/device-notification-policy";
import { useEffect, useState } from "react";
import { PUSH_ENABLED, supportsDevicePush, pushRegistration, saveDevicePush, detachDevicePush } from "@/lib/device-push-client";

export default function DeviceNotifications() {
  const [supported,setSupported] = useState(false), [ready,setReady] = useState(false), [admin,setAdmin] = useState(false), [enabled,setEnabled] = useState(false), [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  const [policy,setPolicy]=useState<PushPolicy>(defaultPushPolicy),[cronConfigured,setCronConfigured]=useState(false);
  const [publicKey,setPublicKey] = useState("");
  const [permission,setPermission]=useState("確認中");
  const load = async () => {
    const response = await fetch("/api/notifications/device", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const value = await response.json(); if (!response.ok) throw new Error(`${value.code}：${value.message}`);
    setPolicy(value.policy??defaultPushPolicy);setCronConfigured(Boolean(value.cronConfigured));setReady(value.ready);setAdmin(value.isAdmin);setPublicKey(value.publicKey ?? "");
  };
  useEffect(() => { setSupported(supportsDevicePush());setPermission("Notification" in window?Notification.permission:"unsupported"); void load().catch(error => setMessage(error.message));
    if (supportsDevicePush()) void navigator.serviceWorker.getRegistration().then(async registration => { const sub = await registration?.pushManager.getSubscription(); setEnabled(Boolean(sub) && Notification.permission === "granted"); });
  }, []);
  const savePolicy=async()=>{setBusy(true);setMessage("");try{const response=await fetch("/api/notifications/device",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"POLICY",policy}),signal:AbortSignal.timeout(10000)});const result=await response.json();if(!response.ok)throw new Error(`${result.code}：${result.message}`);setMessage(result.message);}catch(error){setMessage(error instanceof Error?error.message:"PUSH_POLICY_FAILED：保存できませんでした。");}finally{setBusy(false);}};
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
    } catch (error) { setMessage(error instanceof Error ? (error.message.includes("PUSH_") ? error.message : "PUSH_FAILED："+error.message) : "PUSH_FAILED：通知を設定できませんでした。"); } finally { if("Notification" in window)setPermission(Notification.permission);window.dispatchEvent(new Event("inventory:permission"));setBusy(false); }
  };
  return <section id="device-permissions" className="scroll-mt-20 my-4 rounded-2xl border bg-white p-4" aria-label="端末への通知"><h2 className="text-lg font-black">この端末への通知</h2><p className="my-2 text-sm">アプリを閉じていても、新しい通知を端末の通知欄へ届けます。管理者設定により表示内容・対象が変わります。ログアウト・ログイン期限切れで停止し、次回ログイン時に再接続します。省電力・集中モード・ブラウザの強制終了などで通知が遅れる場合があります。</p>{!supported&&<p className="my-2 text-sm">この環境では端末通知を利用できません。対応するブラウザ、またはホーム画面に追加したアプリで開いてください。通知一覧はそのまま使えます。</p>}{!ready&&<p className="my-2 text-sm">管理者による初回の通知準備が必要です。</p>}<p className="my-3 text-sm">通知許可：{permission==="granted"?"許可済み":permission==="denied"?"ブロック中（ブラウザのサイト設定で変更）":permission==="default"?"未設定":permission==="unsupported"?"非対応":"確認中"} ／ サーバー準備：{ready?"準備済み":"未確認・未準備"} ／ この端末：{enabled?"登録あり":"未接続"}</p><div className="flex flex-wrap gap-2">{supported&&<button disabled={busy} className="rounded-xl border p-3 font-bold" onClick={()=>void act("LOCAL")}>端末の通知表示をテスト</button>}{admin&&!ready&&<button disabled={busy} className="rounded-xl border p-3 font-bold" onClick={()=>void act("SETUP")}>端末通知を準備する</button>}{supported&&ready&&<><button disabled={busy} className="rounded-xl bg-blue-700 p-3 font-bold text-white" onClick={()=>void act(enabled?"DISABLE":"ENABLE")}>{enabled?"この端末の通知を停止":"この端末の通知を許可"}</button>{enabled&&<button disabled={busy} className="rounded-xl border p-3 font-bold" onClick={()=>void act("TEST")}>再接続して配信をテスト</button>}</>}</div>{admin&&ready&&<details className="mt-4 rounded-xl border p-3"><summary className="cursor-pointer py-2 font-bold">管理者：全端末への配信設定</summary><div className="mt-3 space-y-3"><label className="block"><input type="checkbox" checked={policy.enabled} onChange={e=>setPolicy({...policy,enabled:e.target.checked})}/> 端末への配信を有効にする</label><label className="block"><input type="checkbox" checked={policy.showDetails} onChange={e=>setPolicy({...policy,showDetails:e.target.checked})}/> ロック画面にも通知の題名・内容を表示する</label><p className="text-sm">OFFでは「新しい通知があります」とだけ表示します。ONにすると商品名などが端末を開かずに見える場合があります。</p><fieldset><legend className="font-bold">配信する通知</legend><div className="grid gap-2 sm:grid-cols-2">{Object.entries(notificationTypes).map(([type,label])=><label key={type} className="py-2"><input type="checkbox" checked={policy.types.includes(type)} onChange={e=>setPolicy({...policy,types:e.target.checked?[...policy.types,type]:policy.types.filter(t=>t!==type)})}/> {label}</label>)}</div></fieldset><label className="block">通信が戻るまで通知サービスに預ける時間<select className="ml-2 rounded-xl border p-2" value={policy.ttl} onChange={e=>setPolicy({...policy,ttl:Number(e.target.value)})}><option value={300}>5分</option><option value={3600}>1時間</option><option value={86400}>24時間</option></select></label><p className="text-sm">通常は操作後に配信します。無料Hobbyの定期再送は1日1回です。{cronConfigured?"定期実行の認証設定あり（実際の実行結果はVercelで確認）。":"定期再送は未準備：配信先の環境変数 CRON_SECRET に32文字以上のランダムな値を設定してください。"}この設定を変えてもアプリ内の通知履歴は残ります。</p><button disabled={busy} onClick={()=>void savePolicy()} className="rounded-xl bg-slate-800 p-3 font-bold text-white">配信設定を保存</button></div></details>}<DevicePermissions/>{message&&<p role={message.startsWith("PUSH_")?"alert":"status"} className="mt-3 text-sm">{message}</p>}</section>;
}
