import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const currentUser = getLoggedInUser(request);

  if (!currentUser) {
    return NextResponse.json(
      {
        code: "AUTH_REQUIRED",
        message: "ログインが必要です。",
      },
      { status: 401 }
    );
  }

  try {
    const sessions = await prisma.stocktakeSession.findMany({
      where:
        currentUser.role === "ADMIN"
          ? {}
          : {
              operatorUserId: currentUser.id,
            },
      orderBy: {
        startedAt: "desc",
      },
      include: {
        operatorUser: {
          select: {
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
        status: session.status,
        startedAt: session.startedAt,
        pausedAt: session.pausedAt,
        completedAt: session.completedAt,
        scopeLabel: session.scopeLabel,

        // 担当者入力欄に保存された名前
        operator: session.operator,

        // 実際にログインして棚卸をした人
        operatorUser: session.operatorUser,

        targetCount: session._count.targets,
        recordedCount: session._count.records,
      }))
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        code: "STOCKTAKE_HISTORY_FETCH_FAILED",
        message: "棚卸履歴を取得できませんでした。",
      },
      { status: 500 }
    );
  }
}