import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser } from "@/lib/auth";

function canReadNotification(
  notification: {
    audience: "ADMIN" | "USER";
    recipientUserId: string | null;
  },
  user: {
    id: string;
    role: "ADMIN" | "WORKER";
  }
) {
  if (notification.recipientUserId === user.id) {
    return true;
  }

  return (
    user.role === "ADMIN" &&
    notification.audience === "ADMIN"
  );
}

export async function GET(request: NextRequest) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "NOTIFICATION_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const where =
      user.role === "ADMIN"
        ? {
            OR: [
              { audience: "ADMIN" as const },
              { recipientUserId: user.id },
            ],
          }
        : {
            recipientUserId: user.id,
          };

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
      select: {
        id: true,
        type: true,
        audience: true,
        title: true,
        message: true,
        detail: true,
        recipientUserId: true,
        stocktakeSessionId: true,
        readAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      notifications,
      unreadCount: notifications.filter(
        (notification) => notification.readAt === null
      ).length,
    });
  } catch (error) {
    console.error("GET /api/notifications", error);

    return NextResponse.json(
      {
        code: "NOTIFICATION_FETCH_500",
        message: "通知の取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "NOTIFICATION_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as {
      notificationIds?: unknown;
      markAllAsRead?: unknown;
    };

    const markAllAsRead = body.markAllAsRead === true;

    const notificationIds = Array.isArray(body.notificationIds)
      ? body.notificationIds.filter(
          (id): id is string =>
            typeof id === "string" && id.length > 0
        )
      : [];

    if (!markAllAsRead && notificationIds.length === 0) {
      return NextResponse.json(
        {
          code: "NOTIFICATION_UPDATE_400",
          message: "既読にする通知を指定してください。",
        },
        { status: 400 }
      );
    }

    const accessibleWhere =
      user.role === "ADMIN"
        ? {
            OR: [
              { audience: "ADMIN" as const },
              { recipientUserId: user.id },
            ],
          }
        : {
            recipientUserId: user.id,
          };

    const targets = await prisma.notification.findMany({
      where: {
        AND: [
          accessibleWhere,
          markAllAsRead
            ? {}
            : {
                id: {
                  in: notificationIds,
                },
              },
        ],
      },
      select: {
        id: true,
        audience: true,
        recipientUserId: true,
      },
    });

    const permittedIds = targets
      .filter((notification) =>
        canReadNotification(notification, user)
      )
      .map((notification) => notification.id);

    if (permittedIds.length === 0) {
      return NextResponse.json(
        {
          code: "NOTIFICATION_NOT_FOUND_404",
          message: "対象の通知が見つかりません。",
        },
        { status: 404 }
      );
    }

    const result = await prisma.notification.updateMany({
      where: {
        id: {
          in: permittedIds,
        },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      updatedCount: result.count,
      message: "通知を既読にしました。",
    });
  } catch (error) {
    console.error("PATCH /api/notifications", error);

    return NextResponse.json(
      {
        code: "NOTIFICATION_UPDATE_500",
        message: "通知の更新に失敗しました。",
      },
      { status: 500 }
    );
  }
}