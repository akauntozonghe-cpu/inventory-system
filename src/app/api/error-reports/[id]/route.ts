import { NextRequest, NextResponse } from "next/server";
import {
  completeAutoRecovery,
  requireAdminRecovery,
  startAutoRecovery,
} from "@/lib/error-report";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type RecoveryPayload = {
  action?: unknown;
  note?: unknown;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const body = (await req.json()) as RecoveryPayload;
    const note = text(body.note, 1000);

    if (!id) {
      return NextResponse.json(
        {
          message: "エラーレポートIDがありません。",
        },
        {
          status: 400,
        }
      );
    }

    if (body.action === "START_AUTO_RECOVERY") {
      const report = await startAutoRecovery(id);

      if (!report) {
        throw new Error("自動復旧開始の記録に失敗しました。");
      }

      return NextResponse.json({
        success: true,
        status: "IN_PROGRESS",
      });
    }

    if (body.action === "AUTO_RECOVERY_SUCCEEDED") {
      const report = await completeAutoRecovery(
        id,
        note || "自動復旧に成功しました。"
      );

      if (!report) {
        throw new Error("自動復旧完了の記録に失敗しました。");
      }

      return NextResponse.json({
        success: true,
        status: "RECOVERED",
      });
    }

    if (body.action === "ADMIN_REQUIRED") {
      const report = await requireAdminRecovery(
        id,
        note || "自動復旧できなかったため、管理者対応が必要です。"
      );

      if (!report) {
        throw new Error("管理者対応待ちの記録に失敗しました。");
      }

      return NextResponse.json({
        success: true,
        status: "ADMIN_REQUIRED",
      });
    }

    return NextResponse.json(
      {
        message: "指定された復旧操作は使用できません。",
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    console.error("エラーレポート更新エラー", error);

    return NextResponse.json(
      {
        message: "エラーレポートの更新に失敗しました。",
      },
      {
        status: 500,
      }
    );
  }
}