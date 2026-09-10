import { readPushPolicy, pushMessage } from "./device-notification-policy";
import webpush from "web-push";
import { createECDH, createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { after } from "next/server";
import { prisma } from "./prisma";

export const sessionHash = (token: string) => createHash("sha256").update(token).digest("hex");
function secret() {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error("PUSH_SECRET_MISSING");
  return createHash("sha256").update(process.env.AUTH_SECRET).digest();
}
export function encryptPushKey(value: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", secret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(value => value.toString("base64url")).join(".");
}
function decryptPushKey(value: string) {
  const [iv, tag, data] = value.split(".").map(value => Buffer.from(value, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", secret(), iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
export function pushSettingsUsable(settings: {publicKey:string;privateKey:string;subject:string}|null) {
  if(!settings)return false;try{const key=createECDH("prime256v1");key.setPrivateKey(Buffer.from(decryptPushKey(settings.privateKey),"base64url"));const subject=new URL(settings.subject);return ["https:","mailto:"].includes(subject.protocol)&&key.getPublicKey().toString("base64url")===settings.publicKey;}catch{return false;}
}
export function validPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash &&
      ["fcm.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com", "notify.windows.com", "web.push.apple.com"].some(host => url.hostname === host || (host !== "fcm.googleapis.com" && url.hostname.endsWith("." + host)));
  } catch { return false; }
}
export function validPushKeys(keys: unknown): keys is { p256dh: string; auth: string } {
  if (!keys || typeof keys !== "object") return false;
  const value = keys as Record<string, unknown>;
  if (typeof value.p256dh !== "string" || typeof value.auth !== "string" || !/^[A-Za-z0-9_-]+$/.test(value.p256dh) || !/^[A-Za-z0-9_-]+$/.test(value.auth)) return false;
  const publicKey = Buffer.from(value.p256dh, "base64url");
  return publicKey.length === 65 && publicKey[0] === 4 && Buffer.from(value.auth, "base64url").length === 16;
}

export async function sendDeviceNotification(subscription: { endpoint: string; p256dh: string; auth: string }, tag: string, test = false, notification?: {id?:string;title:string;message:string;type:string}) {
  if (!validPushEndpoint(subscription.endpoint)) throw new Error("PUSH_ENDPOINT_INVALID");
  const settings = await prisma.devicePushSetting.findUnique({ where: { id: "system" } });
  if (!settings) throw new Error("PUSH_NOT_READY");
  const policy = readPushPolicy(settings.policy);
  if (!test && (!policy.enabled || (notification && !policy.types.includes(notification.type)))) return false;
  await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ ...pushMessage(policy,notification,test), tag, url: notification?.id ? "/notifications/"+encodeURIComponent(notification.id) : "/notifications" }), { TTL: policy.ttl, timeout: 5000, urgency: "normal", vapidDetails: { subject: settings.subject, publicKey: settings.publicKey, privateKey: decryptPushKey(settings.privateKey) } });
  return true;
}

export async function deliverDeviceNotifications() {
  const now = new Date();
  const settings = await prisma.devicePushSetting.findUnique({where:{id:"system"}});
  if (!settings || !readPushPolicy(settings.policy).enabled) return;
  // Enqueue all eligible devices in one database operation. No first-500-device cap or per-device query loop.
  await prisma.$executeRaw`
    INSERT INTO "DevicePushDelivery" (id,"subscriptionId","notificationId")
    SELECT 'push-' || subscription.id || '-' || notice.id, subscription.id, notice.id
    FROM "DevicePushSubscription" subscription
    JOIN "AppUser" recipient ON recipient.id = subscription."userId" AND recipient."isActive" = true
    JOIN "Notification" notice ON (notice."recipientUserId" = recipient.id OR (notice.audience = 'ADMIN' AND recipient.role = 'ADMIN'))
    WHERE subscription."expiresAt" > CURRENT_TIMESTAMP
      AND notice."createdAt" >= subscription."createdAt"
      AND notice."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      AND (notice."recipientUserId" IS DISTINCT FROM recipient.id OR notice."readAt" IS NULL)
      AND NOT EXISTS (SELECT 1 FROM "NotificationRead" receipt WHERE receipt."notificationId"=notice.id AND receipt."userId"=recipient.id)
    ON CONFLICT ("subscriptionId","notificationId") DO NOTHING`;
  const pending = await prisma.devicePushDelivery.findMany({ where: { sentAt: null, attempts: { lt: 5 }, nextAttemptAt: { lte: now }, subscription: { expiresAt: { gt: now } } }, orderBy: { nextAttemptAt: "asc" }, take: 200, include: { subscription: true } });
  const deadline=Date.now()+45000;
  for(let offset=0;offset<pending.length&&Date.now()<deadline;offset+=10){
  await Promise.allSettled(pending.slice(offset,offset+10).map(async delivery => {
    const claimed = await prisma.devicePushDelivery.updateMany({ where: { id: delivery.id, sentAt: null, attempts: delivery.attempts, nextAttemptAt: { lte: now } }, data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + 60_000 * 2 ** delivery.attempts) } });
    if (!claimed.count) return;
    // Re-check recipients and subscriptions immediately before delivery.
    const [sub, notification, user, readReceipt] = await Promise.all([
      prisma.devicePushSubscription.findUnique({ where: { id: delivery.subscriptionId } }),
      prisma.notification.findUnique({ where: { id: delivery.notificationId } }),
      prisma.appUser.findUnique({ where: { id: delivery.subscription.userId } }),
      prisma.notificationRead.findUnique({where:{notificationId_userId:{notificationId:delivery.notificationId,userId:delivery.subscription.userId}}}),
    ]);
    if (!sub || sub.expiresAt <= new Date() || !notification || readReceipt || (notification.recipientUserId === user?.id && notification.readAt) || !user?.isActive || !(notification.recipientUserId === user.id || (notification.audience === "ADMIN" && user.role === "ADMIN"))) {
      await prisma.devicePushDelivery.updateMany({ where: { id: delivery.id }, data: { sentAt: new Date(),outcome:"SKIPPED",lastErrorCode:"NOT_ELIGIBLE" } }); return;
    }
    try {
      const sent=await sendDeviceNotification(sub, "notification-" + notification.id, false, notification);
      await prisma.devicePushDelivery.updateMany({ where: { id: delivery.id }, data: { sentAt: new Date(),outcome:sent?"SENT":"SKIPPED",lastErrorCode:sent?null:"POLICY_EXCLUDED" } });
    } catch (error) {
      const status = error && typeof error === "object" && "statusCode" in error ? error.statusCode : 0;
      if (status === 404 || status === 410) await prisma.devicePushSubscription.deleteMany({ where: { id: sub.id } });
      else await prisma.devicePushDelivery.updateMany({where:{id:delivery.id},data:{outcome:"RETRY",lastErrorCode:typeof status==="number"&&status>0?"PUSH_HTTP_"+status:"PUSH_SEND_FAILED"}});
      // Transient failures remain queued. Never log endpoints or encryption keys.
    }
  }));
  }
  await prisma.devicePushSubscription.deleteMany({ where: { expiresAt: { lte: now } } });
  await prisma.devicePushDelivery.deleteMany({ where: { sentAt: { lt: new Date(now.getTime() - 7 * 86400000) } } });
}

let lastScheduled = 0;
export function scheduleDeviceNotifications(force = false) {
  if (!force && Date.now() - lastScheduled < 30_000) return;
  lastScheduled = Date.now();
  try { after(async () => { try { await deliverDeviceNotifications(); } catch { console.error("PUSH_DELIVERY_FAILED"); } }); } catch { /* Direct unit invocations do not have a request lifecycle. */ }
}
