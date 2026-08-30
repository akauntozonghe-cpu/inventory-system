import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type CheckStatus = "PASS" | "WARNING" | "FAIL" | "NOT_RUN";

type ManualCheckInput = {
  code: string;
  title: string;
  status: CheckStatus;
  detail?: string;
};

function getErrorMessage(value: unknown, fallback: string) {
  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }

  return fallback;
}

function calculateRunStatus(
  checks: Array<{ status: CheckStatus }>
): "PASSED" | "WARNING" | "FAILED" {
  if (checks.some((check) => check.status === "FAIL")) {
    return "FAILED";
  }

  if (
    checks.some(
      (check) =>
        check.status === "WARNING" || check.status === "NOT_RUN"
    )
  ) {
    return "WARNING";
  }

  return "PASSED";
}

function summarizeChecks(checks: Array<{ status: CheckStatus }>) {
  const passCount = checks.filter(
    (check) => check.status === "PASS"
  ).length;

  const warningCount = checks.filter(
    (check) =>
      check.status === "WARNING" || check.status === "NOT_RUN"
  ).length;

  const failCount = checks.filter(
    (check) => check.status === "FAIL"
  ).length;

  return `正常 ${passCount}件 / 注意 ${warningCount}件 / 異常 ${failCount}件`;
}

function isManualCheck(value: unknown): value is ManualCheckInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const input = value as Record<string, unknown>;

  return (
    typeof input.code === "string" &&
    typeof input.title === "string" &&
    typeof input.status === "string" &&
    ["PASS", "WARNING", "FAIL", "NOT_RUN"].includes(input.status)
  );
}

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);

  if (auth.response || !auth.user) {
    return (
      auth.response ??
      NextResponse.json(
        {
          code: "SYSTEM_CHECK_AUTH_401",
          message: "ログイン情報を確認できませんでした。",
        },
        { status: 401 }
      )
    );
  }

  try {
    const runs = await prisma.systemCheckRun.findMany({
      take: 30,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        executedBy: {
          select: {
            displayName: true,
            username: true,
          },
        },
        items: {
          orderBy: {
            checkedAt: "asc",
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      code: "SYSTEM_CHECK_LIST_OK",
      runs,
    });
  } catch (error) {
    console.error("GET /api/admin/system-check", error);

    return NextResponse.json(
      {
        code: "SYSTEM_CHECK_LIST_FAILED",
        message: getErrorMessage(
          error,
          "点検履歴を取得できませんでした。"
        ),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);

  if (auth.response || !auth.user) {
    return (
      auth.response ??
      NextResponse.json(
        {
          code: "SYSTEM_CHECK_AUTH_401",
          message: "ログイン情報を確認できませんでした。",
        },
        { status: 401 }
      )
    );
  }

  try {
    const body: unknown = await request.json();

    const input =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : {};

    if (input.action === "RUN_AUTO") {
      const startedAt = Date.now();

      const [
        adminCount,
        activeSessionCount,
        reviewWithoutRecordCount,
        inventoryWithoutBarcodeCount,
        inventoryCount,
        itemCount,
        storageLocationCount,
        duplicateItems,
        stocktakeRecordsForIntegrity,
        stocktakeTargetsForIntegrity,
      ] = await Promise.all([
        prisma.appUser.count({
          where: {
            role: "ADMIN",
            isActive: true,
          },
        }),
        prisma.stocktakeSession.count({
          where: {
            status: {
              in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"],
            },
          },
        }),
        prisma.stocktakeSession.count({
          where: {
            status: "REVIEW",
            records: {
              none: {},
            },
          },
        }),
        prisma.inventoryInstance.count({
          where: {
            item: {
              janCode: null,
              systemBarcode: null,
            },
          },
        }),
        prisma.inventoryInstance.count(),
        prisma.item.count(),
        prisma.storageLocation.count(),
        prisma.item.findMany({
          where: { isArchived: false },
          select: { id: true, name: true, janCode: true, managementCode: true },
        }),
        prisma.stocktakeRecord.findMany({
          select: { sessionId: true, inventoryInstanceId: true },
        }),
        prisma.stocktakeTarget.findMany({
          select: { sessionId: true, inventoryInstanceId: true },
        }),
      ]);

      const duplicateKeys = new Map<string, number>();
      for (const item of duplicateItems) {
        for (const value of [
          item.janCode ? `jan:${item.janCode.replace(/[\s-]/g, "")}` : "",
          item.managementCode ? `management:${item.managementCode.replace(/[\s-]/g, "").toLowerCase()}` : "",
          `name:${item.name.normalize("NFKC").trim().toLowerCase()}`,
        ]) {
          if (value) duplicateKeys.set(value, (duplicateKeys.get(value) ?? 0) + 1);
        }
      }
      const duplicateGroupCount = Array.from(duplicateKeys.values()).filter((count) => count > 1).length;
      const targetKeys = new Set(
        stocktakeTargetsForIntegrity.map((target) => `${target.sessionId}:${target.inventoryInstanceId}`)
      );
      const recordWithoutTargetCount = stocktakeRecordsForIntegrity.filter(
        (record) => !targetKeys.has(`${record.sessionId}:${record.inventoryInstanceId}`)
      ).length;

      const responseTimeMs = Date.now() - startedAt;

      const checks: Array<{
        code: string;
        title: string;
        status: CheckStatus;
        detail: string;
        expected?: string;
        actual?: string;
        errorCode?: string;
      }> = [
        {
          code: "CHECK_DATABASE_CONNECTION",
          title: "データベース接続",
          status: "PASS",
          detail: "データベースへ接続し、基本情報を正常に取得できました。",
          expected: "接続成功",
          actual: `${responseTimeMs}ms`,
        },
        {
          code: "CHECK_ACTIVE_ADMIN",
          title: "有効な管理者アカウント",
          status: adminCount > 0 ? "PASS" : "FAIL",
          detail:
            adminCount > 0
              ? "有効な管理者アカウントがあります。"
              : "有効な管理者が存在しません。復旧・承認操作ができません。",
          expected: "1名以上",
          actual: `${adminCount}名`,
          errorCode:
            adminCount > 0 ? undefined : "SYSTEM_CHECK_ADMIN_MISSING",
        },
        {
          code: "CHECK_MASTER_DATA",
          title: "商品・在庫マスター",
          status:
            itemCount > 0 && inventoryCount > 0
              ? "PASS"
              : "WARNING",
          detail: `商品 ${itemCount}件、在庫 ${inventoryCount}件、保管場所 ${storageLocationCount}件を確認しました。`,
          expected: "商品・在庫が1件以上",
          actual: `商品 ${itemCount}件 / 在庫 ${inventoryCount}件`,
        },
        {
          code: "CHECK_ACTIVE_STOCKTAKE",
          title: "進行中棚卸の整合性",
          status: activeSessionCount <= 1 ? "PASS" : "WARNING",
          detail:
            activeSessionCount <= 1
              ? "同時に進行中の棚卸はありません。"
              : `進行中・確認中・競合中の棚卸が ${activeSessionCount}件あります。運用上問題がないか確認してください。`,
          expected: "原則1件以下",
          actual: `${activeSessionCount}件`,
        },
        {
          code: "CHECK_REVIEW_RECORDS",
          title: "確認待ち棚卸の入力状態",
          status: reviewWithoutRecordCount === 0 ? "PASS" : "WARNING",
          detail:
            reviewWithoutRecordCount === 0
              ? "入力記録がない確認待ち棚卸はありません。"
              : `入力記録がない確認待ち棚卸が ${reviewWithoutRecordCount}件あります。管理者の棚卸管理で確認してください。`,
          expected: "0件",
          actual: `${reviewWithoutRecordCount}件`,
        },
        {
          code: "CHECK_PRODUCT_IDENTIFIERS",
          title: "商品識別コード",
          status:
            inventoryWithoutBarcodeCount === 0 ? "PASS" : "WARNING",
          detail:
            inventoryWithoutBarcodeCount === 0
              ? "全在庫にJANまたはシステムバーコードがあります。"
              : `JAN・システムバーコードの両方がない在庫が ${inventoryWithoutBarcodeCount}件あります。`,
          expected: "0件",
          actual: `${inventoryWithoutBarcodeCount}件`,
        },
        {
          code: "CHECK_DUPLICATE_PRODUCTS",
          title: "商品重複候補",
          status: duplicateGroupCount === 0 ? "PASS" : "WARNING",
          detail:
            duplicateGroupCount === 0
              ? "JAN・管理コード・正規化商品名の重複候補はありません。"
              : `重複の可能性がある識別情報が ${duplicateGroupCount}組あります。商品一覧で確認してください。`,
          expected: "0組",
          actual: `${duplicateGroupCount}組`,
          errorCode: duplicateGroupCount === 0 ? undefined : "SYSTEM_CHECK_DUPLICATE_PRODUCTS",
        },
        {
          code: "CHECK_STOCKTAKE_TARGET_LINK",
          title: "棚卸記録と対象の整合性",
          status: recordWithoutTargetCount === 0 ? "PASS" : "FAIL",
          detail:
            recordWithoutTargetCount === 0
              ? "すべての棚卸記録が棚卸対象と対応しています。"
              : `棚卸対象と対応しない記録が ${recordWithoutTargetCount}件あります。`,
          expected: "0件",
          actual: `${recordWithoutTargetCount}件`,
          errorCode: recordWithoutTargetCount === 0 ? undefined : "SYSTEM_CHECK_STOCKTAKE_ORPHAN_RECORD",
        },
      ];

      const status = calculateRunStatus(checks);
      const summary = summarizeChecks(checks);

      const run = await prisma.systemCheckRun.create({
        data: {
          mode: "AUTO",
          status,
          summary,
          executedByUserId: auth.user.id,
          completedAt: new Date(),
          items: {
            create: checks.map((check) => ({
              code: check.code,
              title: check.title,
              type: "AUTO",
              status: check.status,
              detail: check.detail,
              expected: check.expected,
              actual: check.actual,
              errorCode: check.errorCode,
            })),
          },
        },
        include: {
          executedBy: {
            select: {
              displayName: true,
              username: true,
            },
          },
          items: true,
        },
      });

      if (status === "FAILED") {
        await Promise.all([
          prisma.errorReport.create({
            data: {
              code: "SYSTEM_CHECK_FAILED",
              title: "自動システム点検で異常を検出しました",
              message: summary,
              severity: "ERROR",
              status: "INVESTIGATING",
              recoveryStatus: "ADMIN_REQUIRED",
              recoveryAttempts: 1,
              recoveryNote: "安全に自動修復できる一時障害を再確認しましたが、データ変更を伴うため認証後の復旧が必要です。",
              route: "/admin/system-check",
              reporterUserId: auth.user.id,
              detail: {
                systemCheckRunId: run.id,
                checks,
                recoveryRoute: "/admin/system-check",
                steps: [
                  "パスワードで復旧操作を認証する",
                  "異常項目の期待値・実測値・エラーコードを確認する",
                  "項目に表示された対応操作を実行する",
                  "同じ自動点検を再実行して正常を確認する",
                  "エラーレポートへ対応内容を記録して解決済みにする",
                ],
              },
            },
          }),
          prisma.notification.create({
            data: {
              type: "SYSTEM_ERROR",
              audience: "ADMIN",
              title: "システム点検で異常を検出",
              message: summary,
              detail: {
                systemCheckRunId: run.id,
              },
            },
          }),
        ]);
      }

      return NextResponse.json({
        success: true,
        code: "SYSTEM_CHECK_AUTO_COMPLETED",
        message: status === "PASSED" ? "自動点検が完了し、異常はありませんでした。" : "自動点検が完了しました。異常項目にエラーコード・対応方法・復旧手順を表示しています。",
        run,
      });
    }

    if (input.action === "SAVE_MANUAL") {
      const rawChecks = Array.isArray(input.checks) ? input.checks : [];
      const checks = rawChecks.filter(isManualCheck);

      if (checks.length === 0) {
        return NextResponse.json(
          {
            code: "SYSTEM_CHECK_MANUAL_EMPTY",
            message: "手動点検の結果を1件以上入力してください。",
          },
          { status: 400 }
        );
      }

      const status = calculateRunStatus(checks);
      const summary = summarizeChecks(checks);

      const run = await prisma.systemCheckRun.create({
        data: {
          mode: "MANUAL",
          status,
          summary,
          executedByUserId: auth.user.id,
          completedAt: new Date(),
          items: {
            create: checks.map((check) => ({
              code: check.code.trim(),
              title: check.title.trim(),
              type: "MANUAL",
              status: check.status,
              detail:
                typeof check.detail === "string"
                  ? check.detail.trim() || null
                  : null,
            })),
          },
        },
        include: {
          executedBy: {
            select: {
              displayName: true,
              username: true,
            },
          },
          items: true,
        },
      });

      return NextResponse.json({
        success: true,
        code: "SYSTEM_CHECK_MANUAL_SAVED",
        message: "手動点検の結果を保存しました。",
        run,
      });
    }

    return NextResponse.json(
      {
        code: "SYSTEM_CHECK_ACTION_INVALID",
        message: "点検操作が正しくありません。",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("POST /api/admin/system-check", error);

    return NextResponse.json(
      {
        code: "SYSTEM_CHECK_FAILED",
        message: getErrorMessage(
          error,
          "システム点検を実行できませんでした。"
        ),
      },
      { status: 500 }
    );
  }
}
