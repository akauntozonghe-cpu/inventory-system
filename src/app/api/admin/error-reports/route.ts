import { NextRequest, NextResponse } from "next/server";
import { getLoggedInUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function unauthorizedResponse() {
  return NextResponse.json(
    {
      code: "ADMIN_AUTH_403",
      message: "管理者権限が必要です。",
    },
    { status: 403 }
  );
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = getLoggedInUser(request);

    if (!currentUser || !isAdmin(currentUser)) {
      return unauthorizedResponse();
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
    console.error("ADMIN_ERROR_REPORTS_GET_ERROR", error);

    return NextResponse.json(
      {
        code: "ADMIN_ERROR_REPORTS_GET_500",
        message: "エラーレポート一覧を取得できませんでした。",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = getLoggedInUser(request);

    if (!currentUser || !isAdmin(currentUser)) {
      return unauthorizedResponse();
    }

    const body: unknown = await request.json();

    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        {
          code: "ADMIN_ERROR_REPORTS_BODY_400",
          message: "更新内容が正しくありません。",
        },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;
    const reportId =
      typeof data.reportId === "string" ? data.reportId.trim() : "";
    const action =
      typeof data.action === "string" ? data.action.trim() : "";
    const note =
      typeof data.note === "string" ? data.note.trim() : "";

    if (!reportId) {
      return NextResponse.json(
        {
          code: "ADMIN_ERROR_REPORTS_ID_400",
          message: "エラーレポートIDがありません。",
        },
        { status: 400 }
      );
    }

    if (action !== "RESOLVE" && action !== "DISMISS") {
      return NextResponse.json(
        {
          code: "ADMIN_ERROR_REPORTS_ACTION_400",
          message: "対応方法が正しくありません。",
        },
        { status: 400 }
      );
    }

    const report = await prisma.errorReport.findUnique({
      where: {
        id: reportId,
      },
      select: {
        id: true,
        code: true,
        status: true,
      },
    });

    if (!report) {
      return NextResponse.json(
        {
          code: "ADMIN_ERROR_REPORTS_NOT_FOUND_404",
          message: "対象のエラーレポートが見つかりません。",
        },
        { status: 404 }
      );
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const errorReport = await tx.errorReport.update({
        where: {
          id: reportId,
        },
        data:
          action === "RESOLVE"
            ? {
                status: "RESOLVED",
                resolvedAt: now,
                recoveryStatus: "RECOVERED",
                recoveredAt: now,
                recoveryNote: note || "管理者が解決済みにしました。",
              }
            : {
                status: "DISMISSED",
                resolvedAt: now,
                recoveryNote: note || "管理者が対応不要として記録しました。",
              },
      });

      await tx.adminActionLog.create({
        data: {
          action:
            action === "RESOLVE"
              ? "ERROR_REPORT_RESOLVED"
              : "ERROR_REPORT_DISMISSED",
          route: request.nextUrl.pathname,
          adminUserId: currentUser.id,
          errorReportId: reportId,
          detail: {
            reportCode: report.code,
            previousStatus: report.status,
            note: note || null,
          },
        },
      });

      return errorReport;
    });

    return NextResponse.json({
      success: true,
      message:
        action === "RESOLVE"
          ? "エラーレポートを解決済みにしました。"
          : "エラーレポートを対応不要として記録しました。",
      report: updated,
    });
  } catch (error) {
    console.error("ADMIN_ERROR_REPORTS_PATCH_ERROR", error);

    return NextResponse.json(
      {
        code: "ADMIN_ERROR_REPORTS_PATCH_500",
        message: "エラーレポートを更新できませんでした。",
      },
      { status: 500 }
    );
  }
}