import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser, hasAdminAccess } from "@/lib/auth";

type SessionStatus =
  | "IN_PROGRESS"
  | "PAUSED"
  | "REVIEW"
  | "CONFLICT"
  | "COMPLETED"
  | "CANCELLED";

function statusLabel(status: SessionStatus) {
  switch (status) {
    case "IN_PROGRESS":
      return "棚卸作業中";
    case "PAUSED":
      return "中断中";
    case "REVIEW":
      return "確認待ち";
    case "CONFLICT":
      return "要確認";
    case "COMPLETED":
      return "完了";
    case "CANCELLED":
      return "取消";
  }
}

export async function GET(request: NextRequest) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "STOCKTAKE_SESSION_LIST_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const isAdmin = hasAdminAccess(request);

    const sessions = await prisma.stocktakeSession.findMany({
      where: isAdmin
        ? {
            status: {
              in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"],
            },
          }
        : {
            operatorUserId: user.id,
            status: {
              in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"],
            },
          },
      select: {
        id: true,
        title: true,
        operator: true,
        operatorUserId: true,
        location: true,
        memo: true,
        scopeType: true,
        scopeValue: true,
        scopeLabel: true,
        status: true,
        startedAt: true,
        pausedAt: true,
        completedAt: true,
        updatedAt: true,
        operatorUser: {
          select: {
            displayName: true,
            username: true,
          },
        },
        _count: {
          select: {
            targets: true,
            records: true,
          },
        },
      },
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          startedAt: "desc",
        },
      ],
    });

    return NextResponse.json({
      success: true,
      code: "STOCKTAKE_SESSION_LIST_OK",
      sessions: sessions.map((session) => {
        const targetCount = session._count.targets;
        const recordedCount = session._count.records;

        return {
          id: session.id,
          title: session.title,
          operator: session.operator,
          operatorUserId: session.operatorUserId,
          operatorUserName:
            session.operatorUser?.displayName ??
            session.operatorUser?.username ??
            null,
          location: session.location,
          memo: session.memo,
          scopeType: session.scopeType,
          scopeValue: session.scopeValue,
          scopeLabel: session.scopeLabel || "全在庫",
          status: session.status,
          statusLabel: statusLabel(session.status as SessionStatus),
          startedAt: session.startedAt.toISOString(),
          pausedAt: session.pausedAt?.toISOString() ?? null,
          completedAt: session.completedAt?.toISOString() ?? null,
          updatedAt: session.updatedAt.toISOString(),
          targetCount,
          recordedCount,
          unrecordedCount: Math.max(targetCount - recordedCount, 0),
          progressPercent:
            targetCount === 0
              ? 0
              : Math.round((recordedCount / targetCount) * 100),
          canOpen:
            isAdmin ||
            session.operatorUserId === null ||
            session.operatorUserId === user.id,
          canResume:
            session.status === "PAUSED" &&
            (isAdmin ||
              session.operatorUserId === null ||
              session.operatorUserId === user.id),
          isAdminView: isAdmin,
        };
      }),
    });
  } catch (error) {
    console.error("GET /api/stocktake/session", error);

    return NextResponse.json(
      {
        code: "STOCKTAKE_SESSION_LIST_FAILED",
        message: "棚卸セッション一覧を取得できませんでした。",
      },
      { status: 500 }
    );
  }
}