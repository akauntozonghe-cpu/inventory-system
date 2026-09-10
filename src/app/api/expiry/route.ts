import {activeInventoryWhere,inspectionItemWhere,inspectionInventoryWhere} from "@/lib/product-scope";
import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assessExpiry, dateKeyInJapan, expirationEffectiveDate } from "@/lib/expiry-management";

import { expiryPolicy, matchesExpiryFilter } from "@/lib/expiry-policy";

const MANAGEMENT_STATUSES = ["ACTIVE", "MANAGED", "UNSET", "NO_EXPIRY", "ACKNOWLEDGED", "RESOLVED"] as const;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: NextRequest) {
  const auth = requireLogin(request);
  if (auth.response) return auth.response;

  try {
    const today = dateKeyInJapan();
    const [inventories, missingMajor, missingMinor, missingLocation] = await Promise.all([prisma.inventoryInstance.findMany({
      where: activeInventoryWhere,
      select: {
        id: true, expirationDate: true, expirationAlertDays: true,
        expirationManagementStatus: true, expirationNote: true, expirationReviewedAt: true,
        quantity: true, unit: true, lotNo: true, allocationType: true,
        item: { select: { id: true, name: true, janCode: true, systemBarcode: true, majorCategory: true, minorCategory: true } },
        storageLocation: { select: { id: true, name: true } },
      },
      take: 2000,
    }), prisma.item.count({ where: { ...inspectionItemWhere, OR: [{ majorCategory: null }, { majorCategory: "" }] } }),
      prisma.item.count({ where: { ...inspectionItemWhere, OR: [{ minorCategory: null }, { minorCategory: "" }] } }),
      prisma.inventoryInstance.count({ where: { ...inspectionInventoryWhere, storageLocationId: null } })]);

    const entries = inventories.map((inventory) => ({
      ...inventory,
      effectiveDate: expirationEffectiveDate(inventory.expirationDate),
      assessment: assessExpiry(inventory.expirationDate, inventory.expirationAlertDays, today),
    })).sort((a, b) => {
      const left = a.assessment.daysRemaining ?? Number.MAX_SAFE_INTEGER;
      const right = b.assessment.daysRemaining ?? Number.MAX_SAFE_INTEGER;
      return left - right || a.item.name.localeCompare(b.item.name, "ja");
    });

    const count = (levels: string[]) => entries.filter((entry) => levels.includes(entry.assessment.level) && expiryPolicy(entry.expirationDate, entry.expirationManagementStatus) === "MANAGED" && entry.expirationManagementStatus !== "RESOLVED").length;
    return NextResponse.json({
      code: "EXPIRY_LIST_OK",
      today,
      summary: {
        expired: count(["EXPIRED"]), today: count(["TODAY"]), critical: count(["CRITICAL"]),
        warning: count(["WARNING"]), upcoming: count(["UPCOMING"]), invalid: count(["INVALID"]),
        acknowledged: entries.filter((entry) => entry.expirationManagementStatus === "ACKNOWLEDGED").length,
        resolved: entries.filter((entry) => entry.expirationManagementStatus === "RESOLVED").length,
        noExpiry: entries.filter((entry) => matchesExpiryFilter(entry, "NO_EXPIRY")).length,
        missingExpiry: entries.filter((entry) => matchesExpiryFilter(entry, "UNSET")).length,
        missingMajor,
        missingMinor,
        missingLocation,
      },
      entries,
    });
  } catch (error) {
    console.error("GET /api/expiry", error);
    return NextResponse.json({
      code: "EXPIRY_LIST_FAILED",
      message: "期限情報を取得できませんでした。自動再取得後も解決しない場合は、システム点検でDB接続を確認してください。",
      action: "画面の『今すぐ自動復旧』を実行してください。",
      recoveryRoute: "/admin/system-check",
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = requireLogin(request);
  if (auth.response || !auth.user) return auth.response;

  try {
    const body = await request.json() as Record<string, unknown>;
    const id = text(body.id, 100);
    const managementStatus = text(body.managementStatus, 30);
    const note = text(body.note, 1000);
    const alertDays = Number(body.alertDays);
    if (!id || !MANAGEMENT_STATUSES.includes(managementStatus as typeof MANAGEMENT_STATUSES[number])) {
      return NextResponse.json({ code: "EXPIRY_UPDATE_INVALID", message: "期限対応の更新内容が正しくありません。", action: "対象と対応状態を選び直してください。" }, { status: 400 });
    }
    if (!Number.isInteger(alertDays) || alertDays < 1 || alertDays > 365) {
      return NextResponse.json({ code: "EXPIRY_ALERT_DAYS_INVALID", message: "通知日数は1～365日の整数で指定してください。", action: "通知日数を修正してください。" }, { status: 400 });
    }

    const existing = await prisma.inventoryInstance.findUnique({ where: { id }, select: { id: true, quantity: true, expirationDate: true, expirationManagementStatus: true, expirationNote: true, expirationAlertDays: true } });
    if (!existing) return NextResponse.json({ code: "EXPIRY_INVENTORY_NOT_FOUND", message: "対象在庫が見つかりません。", action: "一覧を再読み込みして対象を選び直してください。" }, { status: 404 });

    if ((managementStatus === "UNSET" && existing.expirationDate) || (["ACKNOWLEDGED", "RESOLVED"].includes(managementStatus) && expiryPolicy(existing.expirationDate, existing.expirationManagementStatus) !== "MANAGED")) {
      return NextResponse.json({ code: "EXPIRY_POLICY_CONFLICT", message: "まず期限管理の設定を確認してください。期限登録済みの商品を未設定には戻せません。" }, { status: 400 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventoryInstance.update({
        where: { id },
        data: { expirationManagementStatus: managementStatus, expirationNote: note || null, expirationAlertDays: alertDays, expirationReviewedAt: new Date() },
        select: { id: true, expirationManagementStatus: true, expirationNote: true, expirationAlertDays: true, expirationReviewedAt: true },
      });
      await tx.inventoryEvent.create({ data: {
        inventoryInstanceId: id, eventType: "ADJUSTMENT", quantityBefore: existing.quantity, quantityChange: 0, quantityAfter: existing.quantity,
        reason: "期限管理状態の更新", memo: note || null, performedByUserId: auth.user.id,
        detail: { before: { status: existing.expirationManagementStatus, note: existing.expirationNote, alertDays: existing.expirationAlertDays }, after: { status: managementStatus, note: note || null, alertDays } },
      } });
      return inventory;
    });
    return NextResponse.json({ code: "EXPIRY_UPDATE_OK", message: "期限対応を保存し、履歴へ記録しました。", inventory: updated });
  } catch (error) {
    console.error("PATCH /api/expiry", error);
    return NextResponse.json({ code: "EXPIRY_UPDATE_FAILED", message: "期限対応を保存できませんでした。", action: "入力内容を保持したまま再試行してください。", recoveryRoute: "/admin/error-reports" }, { status: 500 });
  }
}
