import {readPushPolicy,validPushPolicy} from "@/lib/device-notification-policy";
import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { AUTH_COOKIE, requireLogin, hasAdminAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pushSettingsUsable, scheduleDeviceNotifications, encryptPushKey, sessionHash, validPushEndpoint, validPushKeys, sendDeviceNotification } from "@/lib/device-push";

export async function GET(request: NextRequest) {
  const auth = requireLogin(request); if (auth.response || !auth.user) return auth.response;
  const canManage = hasAdminAccess(request);
  try {
    const settings = await prisma.devicePushSetting.findUnique({ where: { id: "system" },  });
    const subscriptionWhere={userId:auth.user.id,sessionHash:sessionHash(request.cookies.get(AUTH_COOKIE)?.value??""),expiresAt:{gt:new Date()}};
    const [registered,sent,retry,failed,last]=await Promise.all([prisma.devicePushSubscription.count({where:subscriptionWhere}),prisma.devicePushDelivery.count({where:{subscription:subscriptionWhere,outcome:"SENT"}}),prisma.devicePushDelivery.count({where:{subscription:subscriptionWhere,sentAt:null,attempts:{lt:5}}}),prisma.devicePushDelivery.count({where:{subscription:subscriptionWhere,sentAt:null,attempts:{gte:5}}}),prisma.devicePushDelivery.findFirst({where:{subscription:subscriptionWhere,lastErrorCode:{not:null}},orderBy:{nextAttemptAt:"desc"},select:{lastErrorCode:true}})]);
    return NextResponse.json({ registered:registered>0,delivery:{sent,retry,failed,lastErrorCode:last?.lastErrorCode??null},ready: pushSettingsUsable(settings), publicKey: settings?.publicKey, isAdmin: canManage, policy:readPushPolicy(settings?.policy), cronConfigured:canManage ? Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length>=32):undefined }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ code: "PUSH_SETUP_REQUIRED", message: "端末通知の準備が完了していません。管理者が更新結果を確認してください。" }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  const auth = requireLogin(request); if (auth.response || !auth.user) return auth.response;
  const input = await request.json().catch(() => null);
  if (!input) return NextResponse.json({ code: "PUSH_INPUT_INVALID", message: "端末情報を確認できませんでした。" }, { status: 400 });
  try {
    if (input.action === "RETRY") {
      await prisma.devicePushDelivery.updateMany({where:{subscription:{userId:auth.user.id,sessionHash:sessionHash(request.cookies.get(AUTH_COOKIE)?.value??"")},sentAt:null},data:{attempts:0,nextAttemptAt:new Date(),outcome:"PENDING",lastErrorCode:null}});
      scheduleDeviceNotifications(true);
      return NextResponse.json({message:"この端末の通常通知を再送待ちに戻しました。少し待って状態を再確認してください。"});
    }
    if (input.action === "POLICY") {
      if (!hasAdminAccess(request)) return NextResponse.json({code:"PUSH_ADMIN_REQUIRED",message:"管理者の認証が必要です。このページのタイトルを3回押して認証し、再試行してください。"},{status:403});
      if (!validPushPolicy(input.policy)) return NextResponse.json({code:"PUSH_POLICY_INVALID",message:"通知設定を確認してください。"},{status:400});
      await prisma.devicePushSetting.update({where:{id:"system"},data:{policy:input.policy}});
      return NextResponse.json({message:"全端末への配信設定を保存しました。"});
    }
    if (input.action === "SETUP") {
      if (!hasAdminAccess(request)) return NextResponse.json({ code: "PUSH_ADMIN_REQUIRED", message: "管理者の認証が必要です。このページのタイトルを3回押して認証し、再試行してください。" }, { status: 403 });
      const keys = webpush.generateVAPIDKeys();
      const settings = await prisma.devicePushSetting.upsert({ where: { id: "system" }, create: { publicKey: keys.publicKey, privateKey: encryptPushKey(keys.privateKey), subject: request.nextUrl.origin }, update: {} });
      if (!pushSettingsUsable(settings)) return NextResponse.json({code:"PUSH_KEYS_UNAVAILABLE",message:"保存済みの通知設定を利用できません。準備は完了していません。既存端末との接続を残すため、設定は上書きしていません。配信サーバーの暗号鍵を元の設定に戻した後、この画面で配信状態を再確認してください。"},{status:503});
      return NextResponse.json({ message: "端末通知の準備ができました。各端末で通知を許可してください。" });
    }
    const subscription = input.subscription;
    if (!subscription || !validPushEndpoint(subscription.endpoint) || !validPushKeys(subscription.keys)) return NextResponse.json({ code: "PUSH_SUBSCRIPTION_INVALID", message: "この端末の通知情報を確認できません。通知を許可し直してください。" }, { status: 400 });
    const hash = sessionHash(request.cookies.get(AUTH_COOKIE)?.value ?? "");
    if (input.action === "TEST") {
      const saved = await prisma.devicePushSubscription.findFirst({ where: { endpoint: subscription.endpoint, userId: auth.user.id, sessionHash: hash, expiresAt: { gt: new Date() } } });
      if (!saved) return NextResponse.json({ code: "PUSH_ENABLE_FIRST", message: "先にこの端末の通知を有効にしてください。" }, { status: 409 });
      await sendDeviceNotification(saved, "inventory-test", true);
      return NextResponse.json({ message: "テスト通知を送信しました。端末の通知欄を確認してください。" });
    }
    if (input.action !== "SUBSCRIBE") return NextResponse.json({ code: "PUSH_ACTION_INVALID", message: "通知の操作を確認してください。" }, { status: 400 });
    if (!(await prisma.devicePushSetting.count())) return NextResponse.json({ code: "PUSH_NOT_READY", message: "管理者が端末通知を準備してから許可してください。" }, { status: 409 });
    const data = { userId: auth.user.id, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, sessionHash: hash, expiresAt: new Date(auth.user.expiresAt) };
    await prisma.$transaction(async tx => {
      const existing = await tx.devicePushSubscription.findUnique({ where: { endpoint: subscription.endpoint } });
      if (existing && existing.userId !== auth.user!.id) await tx.devicePushSubscription.delete({ where: { id: existing.id } });
      await tx.devicePushSubscription.upsert({ where: { endpoint: subscription.endpoint }, create: { endpoint: subscription.endpoint, ...data }, update: data });
    });
    scheduleDeviceNotifications(true);
    return NextResponse.json({ message: "この端末の通知を有効にしました。ログアウトすると停止します。" });
  } catch { return NextResponse.json({ code: "PUSH_DELIVERY_FAILED", message: "端末通知の設定・送信ができませんでした。通信と通知の許可を確認してください。" }, { status: 503 }); }
}
export async function DELETE(request: NextRequest) {
  const auth = requireLogin(request); if (auth.response || !auth.user) return auth.response;
  const input = await request.json().catch(() => null);
  if (!validPushEndpoint(input?.endpoint)) return NextResponse.json({ code: "PUSH_INPUT_INVALID", message: "端末情報を確認できませんでした。" }, { status: 400 });
  try { await prisma.devicePushSubscription.deleteMany({ where: { endpoint: input.endpoint, userId: auth.user.id } }); return NextResponse.json({ message: "この端末の通知を停止しました。" }); }
  catch { return NextResponse.json({ code: "PUSH_DISABLE_FAILED", message: "端末通知を停止できませんでした。もう一度お試しください。" }, { status: 503 }); }
}
