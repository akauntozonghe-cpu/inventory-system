import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser } from "@/lib/auth";
import { assessExpiry } from "@/lib/expiry-management";

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
    if (user.role === "ADMIN") {
      const now = new Date();
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(now);
      const [expiring, existing] = await Promise.all([
        prisma.inventoryInstance.findMany({
          where: { expirationDate: { not: null }, expirationManagementStatus: { not: "RESOLVED" }, status: { not: "廃止" } },
          select: { id: true, expirationDate: true, expirationAlertDays: true, expirationManagementStatus: true, item: { select: { name: true } } },
          orderBy: { expirationDate: "asc" },
          take: 100,
        }),
        prisma.notification.findFirst({
          where: { type: "EXPIRY_ALERT", title: `期限確認 ${today}` },
          select: { id: true },
        }),
      ]);
      const assessed = expiring
        .map((entry) => ({ entry, assessment: assessExpiry(entry.expirationDate, entry.expirationAlertDays, today) }))
        .filter(({ assessment }) => ["EXPIRED", "TODAY", "CRITICAL", "WARNING"].includes(assessment.level));
      if (assessed.length > 0 && !existing) {
        const expiredCount = assessed.filter(({ assessment }) => assessment.level === "EXPIRED").length;
        const todayCount = assessed.filter(({ assessment }) => assessment.level === "TODAY").length;
        const criticalCount = assessed.filter(({ assessment }) => assessment.level === "CRITICAL").length;
        const warningCount = assessed.filter(({ assessment }) => assessment.level === "WARNING").length;
        await prisma.notification.create({
          data: {
            type: "EXPIRY_ALERT",
            audience: "ADMIN",
            title: `期限確認 ${today}`,
            message: `期限切れ ${expiredCount}件、本日期限 ${todayCount}件、7日以内 ${criticalCount}件、通知期間内 ${warningCount}件です。期限管理を開き、優先順に対応を記録してください。`,
            detail: { generatedAt: now.toISOString(), action: "期限管理を開いて、現物確認と対応結果を記録してください。", route: "/expiry", inventoryIds: assessed.map(({ entry }) => entry.id), sampleNames: assessed.slice(0, 10).map(({ entry }) => entry.item.name) },
          },
        });
      }
    }

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
