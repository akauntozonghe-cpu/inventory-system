import {updateDeviceBadge} from "./device-badge";
export const PUSH_ENABLED = "inventory:device-push-enabled";
export function supportsDevicePush() { return typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
export async function pushRegistration() {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  if (registration.active) return registration;
  return Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("PUSH_PREPARING：アプリの準備中です。少し待ってから操作してください。")), 8000))]);
}
export async function saveDevicePush(subscription: PushSubscription, action = "SUBSCRIBE") {
  const response = await fetch("/api/notifications/device", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, subscription: subscription.toJSON() }), signal: AbortSignal.timeout(action === "TEST" || action === "TEST_NORMAL" ? 20000 : 10000) });
  const value = await response.json();
  if (!response.ok) throw new Error(`${value.code ?? "PUSH_FAILED"}：${value.message ?? "通知の設定を保存できませんでした。"}`);
  return value.message as string;
}
export async function detachDevicePush(strict=false) {
  void updateDeviceBadge(0);
  try{sessionStorage.removeItem("inventory:recovery-return");}catch{}
  if (!supportsDevicePush()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      let removed=false;
      try { const response=await fetch("/api/notifications/device", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }), signal: AbortSignal.timeout(4000) }); removed=response.ok; } catch { /* Browser unsubscribe can still stop delivery. */ }
      const unsubscribed=await subscription.unsubscribe();if(strict&&!removed&&!unsubscribed)throw new Error("PUSH_DISABLE_FAILED：端末通知を停止できませんでした。もう一度お試しください。");
    }
    for (const notification of await registration?.getNotifications() ?? []) notification.close();
  } catch (error) { if(strict)throw error; /* Logout also removes this session's server-side subscriptions. */ }
}

export async function ensurePushSubscription(registration:ServiceWorkerRegistration,publicKey:string){
 const bytes=Uint8Array.from(atob(publicKey.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
 let subscription=await registration.pushManager.getSubscription();
 const existing=subscription?.options.applicationServerKey;
 if(subscription&&existing&& (existing.byteLength!==bytes.length||new Uint8Array(existing).some((b,i)=>b!==bytes[i]))){if(!await subscription.unsubscribe())throw new Error("PUSH_RECONNECT_FAILED：古い通知接続を解除できませんでした。少し待って再接続してください。");subscription=null;}
 return subscription??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
}
