export const PUSH_ENABLED = "inventory:device-push-enabled";
export function supportsDevicePush() { return typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
export async function pushRegistration() {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  if (registration.active) return registration;
  return Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("PUSH_PREPARING：アプリの準備中です。少し待ってから操作してください。")), 8000))]);
}
export async function saveDevicePush(subscription: PushSubscription, action = "SUBSCRIBE") {
  const response = await fetch("/api/notifications/device", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, subscription: subscription.toJSON() }), signal: AbortSignal.timeout(10000) });
  const value = await response.json();
  if (!response.ok) throw new Error(`${value.code ?? "PUSH_FAILED"}：${value.message ?? "通知の設定を保存できませんでした。"}`);
  return value.message as string;
}
export async function detachDevicePush(strict=false) {
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
