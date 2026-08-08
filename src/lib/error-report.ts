import {
  ErrorReportStatus,
  ErrorSeverity,
  Prisma,
  RecoveryStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ErrorReportInput = {
  code: string;
  title: string;
  message: string;
  severity?: ErrorSeverity;
  route?: string;
  sessionId?: string;
  reporterUserId?: string;
  detail?: Prisma.InputJsonValue;
};

type AdminActionInput = {
  adminUserId: string;
  action: string;
  route?: string;
  errorReportId?: string;
  targetUserId?: string;
  targetSessionId?: string;
  detail?: Prisma.InputJsonValue;
};

/**
 * エラーレポートを作成する。
 * レポート作成自体の失敗で、元の処理を止めないため null を返す。
 */
export async function createErrorReport(
  input: ErrorReportInput
): Promise<{ id: string } | null> {
  try {
    const report = await prisma.errorReport.create({
      data: {
        code: input.code,
        title: input.title,
        message: input.message,
        severity: input.severity ?? ErrorSeverity.ERROR,
        status: ErrorReportStatus.OPEN,
        route: input.route,
        sessionId: input.sessionId,
        reporterUserId: input.reporterUserId,
        detail: input.detail,
        recoveryStatus: RecoveryStatus.NOT_ATTEMPTED,
      },
      select: {
        id: true,
      },
    });

    return report;
  } catch (error) {
    console.error("エラーレポートの作成に失敗しました。", error);
    return null;
  }
}

/**
 * 自動復旧を開始した記録を残す。
 */
export async function startAutoRecovery(reportId: string) {
  try {
    return await prisma.errorReport.update({
      where: {
        id: reportId,
      },
      data: {
        recoveryStatus: RecoveryStatus.IN_PROGRESS,
        recoveryAttempts: {
          increment: 1,
        },
      },
    });
  } catch (error) {
    console.error("自動復旧開始の記録に失敗しました。", error);
    return null;
  }
}

/**
 * 自動復旧が成功した場合の記録。
 */
export async function completeAutoRecovery(
  reportId: string,
  recoveryNote: string
) {
  try {
    return await prisma.errorReport.update({
      where: {
        id: reportId,
      },
      data: {
        status: ErrorReportStatus.RESOLVED,
        recoveryStatus: RecoveryStatus.RECOVERED,
        recoveredAt: new Date(),
        resolvedAt: new Date(),
        recoveryNote,
      },
    });
  } catch (error) {
    console.error("自動復旧完了の記録に失敗しました。", error);
    return null;
  }
}

/**
 * 自動復旧が失敗し、管理者対応が必要になった場合の記録。
 */
export async function requireAdminRecovery(
  reportId: string,
  recoveryNote: string
) {
  try {
    return await prisma.errorReport.update({
      where: {
        id: reportId,
      },
      data: {
        status: ErrorReportStatus.INVESTIGATING,
        recoveryStatus: RecoveryStatus.ADMIN_REQUIRED,
        recoveryNote,
      },
    });
  } catch (error) {
    console.error("管理者対応待ちの記録に失敗しました。", error);
    return null;
  }
}

/**
 * 管理者の復旧・承認・強制操作を監査ログへ残す。
 */
export async function createAdminActionLog(input: AdminActionInput) {
  try {
    return await prisma.adminActionLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: input.action,
        route: input.route,
        errorReportId: input.errorReportId,
        targetUserId: input.targetUserId,
        targetSessionId: input.targetSessionId,
        detail: input.detail,
      },
    });
  } catch (error) {
    console.error("管理者操作ログの作成に失敗しました。", error);
    return null;
  }
}