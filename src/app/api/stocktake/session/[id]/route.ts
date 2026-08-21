import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser, hasAdminAccess } from "@/lib/auth";

type SessionAction = "PAUSE" | "RESUME" | "COMPLETE";

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "STOCKTAKE_SESSION_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const body: unknown = await request.json();

    const action =
      body &&
      typeof body === "object" &&
      "action" in body &&
      typeof body.action === "string"
        ? body.action
        : "";

    if (
      action !== "PAUSE" &&
      action !== "RESUME" &&
      action !== "COMPLETE"
    ) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_SESSION_ACTION_INVALID",
          message: "指定された棚卸操作は利用できません。",
        },
        { status: 400 }
      );
    }

    const session = await prisma.stocktakeSession.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        title: true,
        operatorUserId: true,
        status: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_SESSION_NOT_FOUND",
          message: "棚卸セッションが見つかりません。",
        },
        { status: 404 }
      );
    }

    const isAdmin = hasAdminAccess(request);
    const isOperator =
      session.operatorUserId === null ||
      session.operatorUserId === user.id;

    if (!isOperator && !isAdmin) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_SESSION_FORBIDDEN",
          message: "この棚卸を操作する権限がありません。",
        },
        { status: 403 }
      );
    }

    if (action === "PAUSE") {
      if (session.status !== "IN_PROGRESS") {
        return NextResponse.json(
          {
            code: "STOCKTAKE_SESSION_PAUSE_INVALID",
            message: "作業中の棚卸だけを中断できます。",
          },
          { status: 409 }
        );
      }

      const updated = await prisma.stocktakeSession.update({
        where: {
          id,
        },
        data: {
          status: "PAUSED",
          pausedAt: new Date(),
        },
        select: {
          id: true,
          title: true,
          status: true,
          pausedAt: true,
        },
      });

      return NextResponse.json({
        success: true,
        code: "STOCKTAKE_SESSION_PAUSED",
        message: `「${updated.title}」を中断しました。`,
        session: {
          ...updated,
          pausedAt: updated.pausedAt?.toISOString() ?? null,
        },
      });
    }

    if (action === "RESUME") {
      if (session.status !== "PAUSED") {
        return NextResponse.json(
          {
            code: "STOCKTAKE_SESSION_RESUME_INVALID",
            message: "中断中の棚卸だけを再開できます。",
          },
          { status: 409 }
        );
      }

      const updated = await prisma.stocktakeSession.update({
        where: {
          id,
        },
        data: {
          status: "IN_PROGRESS",
          pausedAt: null,
        },
        select: {
          id: true,
          title: true,
          status: true,
          pausedAt: true,
        },
      });

      return NextResponse.json({
        success: true,
        code: "STOCKTAKE_SESSION_RESUMED",
        message: `「${updated.title}」を再開しました。`,
        session: {
          ...updated,
          pausedAt: updated.pausedAt?.toISOString() ?? null,
        },
      });
    }

    if (session.status !== "IN_PROGRESS" && session.status !== "PAUSED") {
      return NextResponse.json(
        {
          code: "STOCKTAKE_SESSION_COMPLETE_INVALID",
          message: "この棚卸は終了処理できる状態ではありません。",
        },
        { status: 409 }
      );
    }

    const updated = await prisma.stocktakeSession.update({
      where: {
        id,
      },
      data: {
        status: "REVIEW",
        pausedAt: null,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      code: "STOCKTAKE_SESSION_REVIEW",
      message:
        "棚卸入力を終了しました。結果を確認し、内容に問題がなければ正式確定してください。",
      session: updated,
    });
  } catch (error) {
    console.error("PATCH /api/stocktake/session/[id]", error);

    return NextResponse.json(
      {
        code: "STOCKTAKE_SESSION_UPDATE_FAILED",
        message: getErrorMessage(
          error,
          "棚卸状態を更新できませんでした。時間をおいて再試行してください。"
        ),
      },
      { status: 500 }
    );
  }
}