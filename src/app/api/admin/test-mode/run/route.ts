import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ROLLBACK = "TEST_MODE_ROLLBACK_COMPLETE";

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;

  const setting = await prisma.systemOperationSetting.findUnique({ where: { id: "system" }, select: { mode: true } });
  if (setting?.mode !== "TEST") {
    return NextResponse.json({ code: "TEST_MODE_REQUIRED_409", message: "先に運用モードをテストモードへ切り替えてください。" }, { status: 409 });
  }

  const checks: Array<{ title: string; detail: string }> = [];
  const token = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  try {
    await prisma.$transaction(async (tx) => {
      checks.push({ title: "DB接続", detail: "隔離トランザクションを開始" });
      const existingLocation = await tx.storageLocation.findFirst({ select: { id: true } });
      const location = existingLocation ?? await tx.storageLocation.create({ data: { name: `TEST-${token}`, description: "テストモード専用・自動取消" }, select: { id: true } });
      const item = await tx.item.create({ data: { name: `動作テスト商品 ${token}`, systemBarcode: `TEST-${token}`, defaultUnit: "個" } });
      checks.push({ title: "商品登録", detail: "入力検証とDB登録が完了" });
      const inventory = await tx.inventoryInstance.create({ data: { itemId: item.id, storageLocationId: location.id, quantity: 1, allocationType: "home", status: "active", unit: "個" } });
      checks.push({ title: "在庫登録", detail: "在庫1件を作成" });
      const updated = await tx.inventoryInstance.update({ where: { id: inventory.id }, data: { quantity: 2 } });
      if (updated.quantity !== 2) throw new Error("TEST_UPDATE_MISMATCH");
      checks.push({ title: "在庫更新・再読込", detail: "1から2への更新結果を確認" });
      await tx.inventoryInstance.delete({ where: { id: inventory.id } });
      await tx.item.delete({ where: { id: item.id } });
      checks.push({ title: "削除処理", detail: "関連順序と制約を確認" });
      throw new Error(ROLLBACK);
    }, { timeout: 15_000 });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== ROLLBACK) {
      return NextResponse.json({ code: "TEST_MODE_EXECUTION_FAILED", message: "隔離テストで異常を検出しました。エラーレポートを確認してください。", checks }, { status: 500 });
    }
  }

  checks.push({ title: "本番データ保護", detail: "全テスト変更の取消を完了" });
  await prisma.adminActionLog.create({ data: { adminUserId: auth.user.id, action: "ISOLATED_SYSTEM_TEST_SUCCEEDED", route: "/admin/operation-mode", detail: { checks, completedAt: new Date().toISOString() } } });
  return NextResponse.json({ success: true, code: "ISOLATED_SYSTEM_TEST_SUCCEEDED", message: "一連の処理はすべて正常です。本番データへの変更はありません。", checks });
}
