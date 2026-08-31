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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = getLoggedInUser(request);
    const body = (await request.json()) as UpdatePayload;
    const { id } = await context.params;

    if (!currentUser) {
      return NextResponse.json(
        { code: "ERROR_REPORT_UPDATE_AUTH_401", message: "ログインが必要です。" },
        { status: 401 }
      );
    }

    if (
      body.action === "START_AUTO_RECOVERY" ||
      body.action === "AUTO_RECOVERY_SUCCEEDED" ||
      body.action === "ADMIN_REQUIRED"
    ) {
      const report = await prisma.errorReport.findUnique({ where: { id } });
      if (!report || (!isAdmin(currentUser) && report.reporterUserId !== currentUser.id)) {
        return NextResponse.json(
          { code: "ERROR_REPORT_UPDATE_NOT_FOUND_404", message: "対象のエラー情報を更新できません。" },
          { status: 404 }
        );
      }

      const updated = await prisma.errorReport.update({
        where: { id },
        data:
          body.action === "START_AUTO_RECOVERY"
            ? {
                recoveryStatus: RecoveryStatus.IN_PROGRESS,
                recoveryAttempts: { increment: 1 },
              }
            : body.action === "AUTO_RECOVERY_SUCCEEDED"
              ? {
                  status: ErrorReportStatus.RESOLVED,
                  recoveryStatus: RecoveryStatus.RECOVERED,
                  recoveredAt: new Date(),
                  resolvedAt: new Date(),
                  recoveryNote: "自動復旧に成功しました。",
                }
              : {
                  status: ErrorReportStatus.INVESTIGATING,
                  recoveryStatus: RecoveryStatus.ADMIN_REQUIRED,
                  recoveryNote: "自動復旧できなかったため管理者対応が必要です。",
                },
      });

      if (body.action === "ADMIN_REQUIRED") {
        await prisma.notification.create({
          data: {
            type: "SYSTEM_ERROR",
            audience: "ADMIN",
            title: `復旧対応が必要：${report.code}`,
            message: `${report.title}は自動復旧できませんでした。エラー管理から直ちに復旧してください。`,
            detail: { errorReportId: report.id, code: report.code, route: report.route, sessionId: report.sessionId, recoveryRoute: "/admin/error-reports" },
          },
        }).catch((notificationError) => console.error("管理者復旧通知に失敗しました。", notificationError));
      }

      return NextResponse.json({ success: true, report: updated });
    }

    if (!isAdmin(currentUser)) {
      return NextResponse.json(
        {
          code: "ADMIN_ERROR_REPORTS_FORBIDDEN_403",
          message: "エラーレポートを操作する権限がありません。",
        },
        { status: 403 }
      );
    }

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = getLoggedInUser(request);

    if (!currentUser) {
      return NextResponse.json(
        { code: "ERROR_REPORT_STATUS_AUTH_401", message: "ログインが必要です。" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const report = await prisma.errorReport.findUnique({
      where: { id },
      select: {
        reporterUserId: true,
        status: true,
        recoveryStatus: true,
      },
    });

    if (!report || (!isAdmin(currentUser) && report.reporterUserId !== currentUser.id)) {
      return NextResponse.json(
        { code: "ERROR_REPORT_STATUS_NOT_FOUND_404", message: "対象のエラー情報を確認できません。" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      approved:
        report.status === ErrorReportStatus.RESOLVED &&
        report.recoveryStatus === RecoveryStatus.RECOVERED,
      status: report.status,
      recoveryStatus: report.recoveryStatus,
    });
  } catch (error) {
    console.error("エラーレポート状態取得エラー", error);
    return NextResponse.json(
      { code: "ERROR_REPORT_STATUS_500", message: "復旧状態を確認できませんでした。" },
      { status: 500 }
    );
  }
}
