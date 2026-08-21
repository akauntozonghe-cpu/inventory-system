import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser, hasAdminAccess } from "@/lib/auth";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "STOCKTAKE_PROGRESS_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const { id: sessionId } = await params;

    const session = await prisma.stocktakeSession.findUnique({
      where: {
        id: sessionId,
      },
      select: {
        id: true,
        title: true,
        operator: true,
        operatorUserId: true,
        scopeLabel: true,
        status: true,
        startedAt: true,
        pausedAt: true,
        completedAt: true,
        cancelledAt: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_PROGRESS_SESSION_404",
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
          code: "STOCKTAKE_PROGRESS_FORBIDDEN",
          message: "この棚卸を表示する権限がありません。",
        },
        { status: 403 }
      );
    }

    const [targets, records] = await Promise.all([
      prisma.stocktakeTarget.findMany({
        where: {
          sessionId,
        },
        select: {
          inventoryInstanceId: true,
          expectedQuantity: true,
        },
      }),

      prisma.stocktakeRecord.findMany({
        where: {
          sessionId,
        },
        select: {
          inventoryInstanceId: true,
          countedQuantity: true,
          updatedAt: true,
        },
      }),
    ]);

    const expectedQuantityMap = new Map(
      targets.map((target) => [
        target.inventoryInstanceId,
        target.expectedQuantity,
      ])
    );

    const recordedCount = records.length;

    const matchedCount = records.filter((record) => {
      const expectedQuantity = expectedQuantityMap.get(
        record.inventoryInstanceId
      );

      return expectedQuantity === record.countedQuantity;
    }).length;

    const differenceCount = recordedCount - matchedCount;
    const targetCount = targets.length;
    const unrecordedCount = Math.max(targetCount - recordedCount, 0);

    const latestRecord =
      records.length > 0
        ? records.reduce((latest, record) =>
            record.updatedAt > latest.updatedAt ? record : latest
          )
        : null;

    return NextResponse.json({
      success: true,
      code: "STOCKTAKE_PROGRESS_OK",

      session: {
        id: session.id,
        title: session.title,
        operator: session.operator,
        scopeLabel: session.scopeLabel || "全在庫",
        status: session.status,
        startedAt: session.startedAt.toISOString(),
        pausedAt: session.pausedAt?.toISOString() ?? null,
        completedAt: session.completedAt?.toISOString() ?? null,
        cancelledAt: session.cancelledAt?.toISOString() ?? null,
      },

      permissions: {
        isOperator,
        isAdmin,

        // 作業者だけが、作業中の棚卸へ入力できます。
        canOperate: isOperator && session.status === "IN_PROGRESS",

        // 管理者は他人の棚卸を含め、状態確認・中断・再開・終了を管理できます。
        canManage: isAdmin,
      },

      summary: {
        targetCount,
        recordedCount,
        matchedCount,
        differenceCount,
        unrecordedCount,
        progressPercent:
          targetCount === 0
            ? 0
            : Math.round((recordedCount / targetCount) * 100),
      },

      lastRecordedAt: latestRecord?.updatedAt.toISOString() ?? null,
    });
  } catch (error) {
    console.error("GET /api/stocktake/session/[id]/progress", error);

    return NextResponse.json(
      {
        code: "STOCKTAKE_PROGRESS_FAILED",
        message: getErrorMessage(
          error,
          "棚卸進捗を取得できませんでした。"
        ),
      },
      { status: 500 }
    );
  }
}