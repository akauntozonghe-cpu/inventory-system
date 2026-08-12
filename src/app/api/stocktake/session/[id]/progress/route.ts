import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getLoggedInUser,
  hasAdminAccess,
} from "@/lib/auth";

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
    const { id } = await params;

    const session = await prisma.stocktakeSession.findUnique({
      where: { id },
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

    const canView =
      session.operatorUserId === user.id ||
      hasAdminAccess(request);

    if (!canView) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_PROGRESS_FORBIDDEN",
          message: "この棚卸の進捗を閲覧する権限がありません。",
        },
        { status: 403 }
      );
    }

    const [targets, records] = await Promise.all([
      prisma.stocktakeTarget.findMany({
        where: { sessionId: id },
        select: {
          inventoryInstanceId: true,
          expectedQuantity: true,
        },
      }),

      prisma.stocktakeRecord.findMany({
        where: { sessionId: id },
        select: {
          inventoryInstanceId: true,
          countedQuantity: true,
          updatedAt: true,
        },
      }),
    ]);

    const expectedByInventoryId = new Map(
      targets.map((target) => [
        target.inventoryInstanceId,
        target.expectedQuantity,
      ])
    );

    const matchedCount = records.filter(
      (record) =>
        expectedByInventoryId.get(
          record.inventoryInstanceId
        ) === record.countedQuantity
    ).length;

    const targetCount = targets.length;
    const recordedCount = records.length;
    const differenceCount = recordedCount - matchedCount;
    const unrecordedCount = Math.max(
      targetCount - recordedCount,
      0
    );

    return NextResponse.json({
      session,
      summary: {
        targetCount,
        recordedCount,
        matchedCount,
        differenceCount,
        unrecordedCount,
        progressPercent:
          targetCount === 0
            ? 0
            : Math.round(
                (recordedCount / targetCount) * 100
              ),
      },
      lastRecordedAt:
        records.length > 0
          ? records.reduce(
              (latest, record) =>
                record.updatedAt > latest
                  ? record.updatedAt
                  : latest,
              records[0].updatedAt
            )
          : null,
    });
  } catch (error) {
    console.error(
      "GET /api/stocktake/session/[id]/progress",
      error
    );

    return NextResponse.json(
      {
        code: "STOCKTAKE_PROGRESS_500",
        message: "棚卸進捗の取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}