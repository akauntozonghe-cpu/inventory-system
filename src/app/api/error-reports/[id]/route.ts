import {
  ErrorReportStatus,
  RecoveryStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getLoggedInUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAdminActionLog } from "@/lib/error-report";

type UpdatePayload = {
  reportId?: unknown;
  action?: unknown;
  note?: unknown;
};

function getText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function requireAdmin(request: NextRequest) {
  const currentUser = getLoggedInUser(request);

  if (!isAdmin(currentUser)) {
    return null;
  }

  return currentUser;
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await requireAdmin(request);

    if (!currentUser) {
      return NextResponse.json(
        {
          code: "ADMIN_ERROR_REPORTS_FORBIDDEN_403",
          message: "エラーレポートを確認する権限がありません。",
        },
        { status: 403 }
      );
    }

    const reports = await prisma.errorReport.findMany({
      orderBy: {
        occurredAt: "desc",
      },
      take: 100,
      include: {
        reporterUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
        adminActionLogs: {
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
          include: {
            adminUser: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(reports);
  } catch (error) {
    console.error("エラーレポート一覧取得エラー", error);

    return NextResponse.json(
      {
        code: "ADMIN_ERROR_REPORTS_FETCH_500",
        message: "エラーレポート一覧を取得できませんでした。",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await requireAdmin(request);

    if (!currentUser) {
      return NextResponse.json(
        {
          code: "ADMIN_ERROR_REPORTS_FORBIDDEN_403",
          message: "エラーレポートを操作する権限がありません。",
        },
        { status: 403 }
      );
    }

    const body = (await request.json()) as UpdatePayload;
    const reportId = getText(body.reportId, 100);
    const note = getText(body.note, 1000);

    if (!reportId) {
      return NextResponse.json(
        {
          code: "ADMIN_ERROR_REPORTS_ID_400",
          message: "対象のエラーレポートを指定してください。",
        },
        { status: 400 }
      );
    }

    if (body.action === "RESOLVE") {
      const report = await prisma.errorReport.update({
        where: {
          id: reportId,
        },
        data: {
          status: ErrorReportStatus.RESOLVED,
          recoveryStatus: RecoveryStatus.RECOVERED,
          resolvedAt: new Date(),
          recoveredAt: new Date(),
          recoveryNote: note || "管理者が復旧完了として記録しました。",
        },
      });

      await createAdminActionLog({
        adminUserId: currentUser.id,
        errorReportId: report.id,
        action: "ERROR_REPORT_RESOLVED",
        route: "/admin/error-reports",
        detail: {
          note: note || "管理者が復旧完了として記録しました。",
        },
      });

      return NextResponse.json({
        success: true,
        report,
      });
    }

    if (body.action === "DISMISS") {
      const report = await prisma.errorReport.update({
        where: {
          id: reportId,
        },
        data: {
          status: ErrorReportStatus.DISMISSED,
          recoveryNote: note || "管理者が対応不要として記録しました。",
        },
      });

      await createAdminActionLog({
        adminUserId: currentUser.id,
        errorReportId: report.id,
        action: "ERROR_REPORT_DISMISSED",
        route: "/admin/error-reports",
        detail: {
          note: note || "管理者が対応不要として記録しました。",
        },
      });

      return NextResponse.json({
        success: true,
        report,
      });
    }

    return NextResponse.json(
      {
        code: "ADMIN_ERROR_REPORTS_ACTION_400",
        message: "指定された管理者操作は利用できません。",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("エラーレポート管理操作エラー", error);

    return NextResponse.json(
      {
        code: "ADMIN_ERROR_REPORTS_UPDATE_500",
        message: "エラーレポートの更新に失敗しました。",
      },
      { status: 500 }
    );
  }
}