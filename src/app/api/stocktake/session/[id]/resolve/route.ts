import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser } from "@/lib/auth";

function getOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "STOCKTAKE_RESOLVE_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json(
      {
        code: "STOCKTAKE_RESOLVE_FORBIDDEN",
        message: "競合した棚卸を処理できるのは管理者のみです。",
      },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as {
      note?: unknown;
    };

    const note = getOptionalString(body.note);

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.stocktakeSession.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          status: true,
          targets: {
            select: {
              id: true,
            },
          },
          records: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!session) {
        return {
          kind: "NOT_FOUND" as const,
        };
      }

      if (session.status !== "CONFLICT") {
        return {
          kind: "INVALID_STATUS" as const,
          status: session.status,
        };
      }

      const cancellationNote =
        note || "在庫競合のため、管理者が安全終了しました。";

      const updatedSession = await tx.stocktakeSession.update({
        where: { id },
        data: {
          status: "CANCELLED",
          pausedAt: null,
          cancelledAt: new Date(),
          cancelledByUserId: user.id,
          cancellationNote,
        },
        select: {
          id: true,
          title: true,
          status: true,
          cancelledAt: true,
          cancelledByUserId: true,
          cancellationNote: true,
        },
      });

      await tx.adminActionLog.create({
        data: {
          adminUserId: user.id,
          action: "STOCKTAKE_CONFLICT_CANCELLED",
          route: `/api/stocktake/session/${id}/resolve`,
          targetSessionId: id,
          detail: {
            reason: cancellationNote,
            targetCount: session.targets.length,
            recordedCount: session.records.length,
            inventoryUpdated: false,
          },
        },
      });

      await tx.notification.create({
        data: {
          type: "STOCKTAKE_CONFLICT",
          audience: "ADMIN",
          title: `競合棚卸を安全終了しました：${session.title}`,
          message:
            "在庫数は変更していません。棚卸入力は履歴・監査記録として保持されています。",
          stocktakeSessionId: id,
          detail: {
            resolvedByUserId: user.id,
            reason: cancellationNote,
            targetCount: session.targets.length,
            recordedCount: session.records.length,
            inventoryUpdated: false,
          },
        },
      });

      return {
        kind: "RESOLVED" as const,
        session: updatedSession,
      };
    });

    if (result.kind === "NOT_FOUND") {
      return NextResponse.json(
        {
          code: "STOCKTAKE_RESOLVE_NOT_FOUND",
          message: "棚卸セッションが見つかりません。",
        },
        { status: 404 }
      );
    }

    if (result.kind === "INVALID_STATUS") {
      return NextResponse.json(
        {
          code: "STOCKTAKE_RESOLVE_INVALID_STATUS",
          message:
            "競合停止中ではない棚卸を安全終了することはできません。",
          status: result.status,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "競合した棚卸を安全終了しました。在庫数は変更していません。新しい棚卸を開始できます。",
      session: result.session,
    });
  } catch (error) {
    console.error(
      "POST /api/stocktake/session/[id]/resolve",
      error
    );

    return NextResponse.json(
      {
        code: "STOCKTAKE_RESOLVE_500",
        message: "競合棚卸の安全終了に失敗しました。",
      },
      { status: 500 }
    );
  }
}