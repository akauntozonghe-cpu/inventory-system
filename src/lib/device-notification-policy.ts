export const notificationTypes = {
  STOCKTAKE_COMPLETED: "棚卸の完了", STOCKTAKE_CONFLICT: "棚卸の確認待ち",
  STOCKTAKE_DIFFERENCE: "棚卸の差異", LOW_STOCK: "在庫不足", EXPIRY_ALERT: "期限",
  REGISTRATION_REQUEST: "商品登録の確認", SYSTEM_ERROR: "システムエラー", MARKETPLACE_SOLD: "フリマの売却",
} as const;
export type PushPolicy = { enabled: boolean; showDetails: boolean; types: string[]; ttl: number };
export const defaultPushPolicy: PushPolicy = { enabled: true, showDetails: false, types: Object.keys(notificationTypes), ttl: 3600 };
export function validPushPolicy(value: unknown): value is PushPolicy {
  if (!value || typeof value !== "object") return false;
  const p = value as PushPolicy;
  return typeof p.enabled === "boolean" && typeof p.showDetails === "boolean" &&
    Array.isArray(p.types) && p.types.every(t => typeof t === "string" && Object.hasOwn(notificationTypes,t)) &&
    new Set(p.types).size === p.types.length && [300,3600,86400].includes(p.ttl);
}
export function readPushPolicy(value: unknown): PushPolicy { return validPushPolicy(value) ? value : defaultPushPolicy; }
export function pushMessage(policy: PushPolicy, notification?: { title: string; message: string }, test = false) {
  return { title: policy.showDetails && notification && !test ? notification.title.slice(0,100) : "Inventory OS",
    body: test ? "端末通知のテストです。" : policy.showDetails && notification ? notification.message.slice(0,300) : "新しい通知があります。アプリで内容を確認してください。",
    showDetails: policy.showDetails && !test };
}
