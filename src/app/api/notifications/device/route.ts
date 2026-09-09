import {readPushPolicy,validPushPolicy} from "@/lib/device-notification-policy";
import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { AUTH_COOKIE, requireLogin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptPushKey, sessionHash, validPushEndpoint, validPushKeys, sendDeviceNotification } from "@/lib/device-push";

export async function GET(request: NextRequest) {
  const auth = requireLogin(request); if (auth.response || !auth.user) return auth.response;
  try {
    const settings = await prisma.devicePushSetting.findUnique({ where: { id: "system" }, select: { publicKey: true, policy:true } });
    return NextResponse.json({ ready: Boolean(settings), publicKey: settings?.publicKey, isAdmin: auth.user.role === "ADMIN", policy:readPushPolicy(settings?.policy), cronConfigured:auth.user.role === "ADMIN" ? Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length>=32):undefined }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ code: "PUSH_SETUP_REQUIRED", message: "端末通知の準備が完了していません。管理者が更新結果を確認してください。" }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  const auth = requireLogin(request); if (auth.response || !auth.user) return auth.response;
  const input = await request.json().catch(() => null);
  if (!input) return NextResponse.json({ code: "PUSH_INPUT_INVALID", message: "端末情報を確認できませんでした。" }, { status: 400 });
  try {
    if (input.action === "POLICY") {
      if (auth.user.role !== "ADMIN") return NextResponse.json({code:"PUSH_ADMIN_REQUIRED",message:"管理者の設定が必要です。"},{status:403});
      if (!validPushPolicy(input.policy)) return NextResponse.json({code:"PUSH_POLICY_INVALID",message:"通知設定を確認してください。"},{status:400});
      await prisma.devicePushSetting.update({where:{id:"system"},data:{policy:input.policy}});
      return NextResponse.json({message:"全端末への配信設定を保存しました。"});
    }
    if (input.action === "SETUP") {
      if (auth.user.role !== "ADMIN") return NextResponse.json({ code: "PUSH_ADMIN_REQUIRED", message: "管理者の設定が必要です。" }, { status: 403 });
      const keys = webpush.generateVAPIDKeys();
      await prisma.devicePushSetting.upsert({ where: { id: "system" }, create: { publicKey: keys.publicKey, privateKey: encryptPushKey(keys.privateKey), subject: request.nextUrl.origin }, update: {} });
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
