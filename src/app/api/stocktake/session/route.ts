import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getLoggedInUser,
  hasAdminAccess,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "STOCKTAKE_LIST_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const activeOnly =
      request.nextUrl.searchParams.get("active") === "true";

    const canViewAllSessions =
      user.role === "ADMIN" || hasAdminAccess(request);

    const sessions = await prisma.stocktakeSession.findMany({
      where: {
        ...(canViewAllSessions
          ? {}
          : {
              operatorUserId: user.id,
            }),

        ...(activeOnly
          ? {
              status: {
                in: [
                  "IN_PROGRESS",
                  "PAUSED",
                  // 過去バージョンとの互換用
                  "REVIEW",
                  "CONFLICT",
                ],
              },
            }
          : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        title: true,
        operator: true,
        location: true,
        memo: true,
        scopeType: true,
        scopeLabel: true,
        status: true,
        startedAt: true,
        pausedAt: true,
        completedAt: true,
        cancelledAt: true,
        cancelledByUserId: true,
        cancellationNote: true,
        createdAt: true,
        operatorUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
        _count: {
          select: {
            targets: true,
            records: true,
          },
        },
      },
    });

    return NextResponse.json(
      sessions.map((session) => ({
        id: session.id,
        title: session.title,
        operator: session.operator,
        location: session.location,
        memo: session.memo,
        scopeType: session.scopeType,
        scopeLabel: session.scopeLabel,
        status: session.status,
        startedAt: session.startedAt,
        pausedAt: session.pausedAt,
        completedAt: session.completedAt,
        cancelledAt: session.cancelledAt,
        cancelledByUserId: session.cancelledByUserId,
        cancellationNote: session.cancellationNote,
        createdAt: session.createdAt,
        operatorUser: session.operatorUser,
        targetCount: session._count.targets,
        recordedCount: session._count.records,
      }))
    );
  } catch (error) {
    console.error("GET /api/stocktake/session", error);

    return NextResponse.json(
      {
        code: "STOCKTAKE_LIST_500",
        message: "棚卸セッション一覧の取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}