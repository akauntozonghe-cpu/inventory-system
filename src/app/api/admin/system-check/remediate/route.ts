import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminElevation, requireAdmin } from "@/lib/auth";

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

function createSystemBarcode() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `SYS-${timestamp}-${random}`;
}

async function issueUniqueSystemBarcode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const barcode = createSystemBarcode();

    const exists = await prisma.item.findUnique({
      where: {
        systemBarcode: barcode,
      },
      select: {
        id: true,
      },
    });

    if (!exists) {
      return barcode;
    }
  }

  throw new Error(
    "SYSTEM_BARCODE_GENERATE_FAILED: システムバーコードを発行できませんでした。"
  );
}

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);

  if (auth.response || !auth.user) {
    return (
      auth.response ??
      NextResponse.json(
        {
          code: "SYSTEM_REMEDIATION_AUTH_401",
          message: "ログイン情報を確認できませんでした。",
        },
        { status: 401 }
      )
    );
  }

  const elevation = getAdminElevation(request);
  if (!elevation || elevation.authenticatedByUserId !== auth.user.id) {
    return NextResponse.json(
      {
        code: "ADMIN_ELEVATION_REQUIRED",
        message: "復旧操作の前にIDとパスワードで再認証してください。",
      },
      { status: 403 }
    );
  }

  try {
    const [activeSessions, inventoriesWithoutIdentifier] =
      await Promise.all([
        prisma.stocktakeSession.findMany({
          where: {
            status: {
              in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"],
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
          select: {
            id: true,
            title: true,
            operator: true,
            status: true,
            scopeLabel: true,
            startedAt: true,
            pausedAt: true,
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
        }),

        prisma.inventoryInstance.findMany({
          where: {
            item: {
              janCode: null,
              systemBarcode: null,
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
          select: {
            id: true,
            quantity: true,
            unit: true,
            updatedAt: true,
            item: {
              select: {
                id: true,
                name: true,
                janCode: true,
                systemBarcode: true,
                managementCode: true,
              },
            },
            storageLocation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        }),
      ]);

    return NextResponse.json({
      success: true,
      code: "SYSTEM_REMEDIATION_LIST_OK",
      activeSessions,
      inventoriesWithoutIdentifier,
    });
  } catch (error) {
    console.error("GET /api/admin/system-check/remediate", error);

    return NextResponse.json(
      {
        code: "SYSTEM_REMEDIATION_LIST_FAILED",
        message: getErrorMessage(
          error,
          "復旧対象の情報を取得できませんでした。"
        ),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = requireAdmin(request);

  if (auth.response || !auth.user) {
    return (
      auth.response ??
      NextResponse.json(
        {
          code: "SYSTEM_REMEDIATION_AUTH_401",
          message: "ログイン情報を確認できませんでした。",
        },
        { status: 401 }
      )
    );
  }

  try {
    const body: unknown = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          code: "SYSTEM_REMEDIATION_BODY_INVALID",
          message: "操作内容が正しくありません。",
        },
        { status: 400 }
      );
    }

    const input = body as Record<string, unknown>;
    const action = input.action;

    if (
      action === "PAUSE_SESSION" ||
      action === "RESUME_SESSION" ||
      action === "CANCEL_SESSION"
    ) {
      const sessionId =
        typeof input.sessionId === "string" ? input.sessionId : "";

      const reason =
        typeof input.reason === "string" ? input.reason.trim() : "";

      if (!sessionId) {
        return NextResponse.json(
          {
            code: "SYSTEM_REMEDIATION_SESSION_ID_REQUIRED",
            message: "棚卸セッションを指定してください。",
          },
          { status: 400 }
        );
      }

      if (action === "CANCEL_SESSION" && !reason) {
        return NextResponse.json(
          {
            code: "SYSTEM_REMEDIATION_CANCEL_REASON_REQUIRED",
            message: "取消理由を入力してください。",
          },
          { status: 400 }
        );
      }

      const session = await prisma.stocktakeSession.findUnique({
        where: {
          id: sessionId,
        },
        select: {
          id: true,
          title: true,
          status: true,
        },
      });

      if (!session) {
        return NextResponse.json(
          {
            code: "SYSTEM_REMEDIATION_SESSION_404",
            message: "棚卸セッションが見つかりません。",
          },
          { status: 404 }
        );
      }

      if (action === "PAUSE_SESSION") {
        if (session.status !== "IN_PROGRESS") {
          return NextResponse.json(
            {
              code: "SYSTEM_REMEDIATION_PAUSE_INVALID_STATUS",
              message: "作業中の棚卸のみ中断できます。",
            },
            { status: 409 }
          );
        }

        await prisma.$transaction([
          prisma.stocktakeSession.update({
            where: {
              id: session.id,
            },
            data: {
              status: "PAUSED",
              pausedAt: new Date(),
            },
          }),

          prisma.adminActionLog.create({
            data: {
              action: "SYSTEM_CHECK_PAUSE_STOCKTAKE",
              route: "/admin/system-check",
              adminUserId: auth.user.id,
              targetSessionId: session.id,
              detail: {
                title: session.title,
                previousStatus: session.status,
              },
            },
          }),
        ]);

        return NextResponse.json({
          success: true,
          code: "SYSTEM_REMEDIATION_SESSION_PAUSED",
          message: `「${session.title}」を中断しました。`,
        });
      }

      if (action === "RESUME_SESSION") {
        if (
          session.status !== "PAUSED" &&
          session.status !== "CONFLICT"
        ) {
          return NextResponse.json(
            {
              code: "SYSTEM_REMEDIATION_RESUME_INVALID_STATUS",
              message: "中断中または競合中の棚卸のみ再開できます。",
            },
            { status: 409 }
          );
        }

        await prisma.$transaction([
          prisma.stocktakeSession.update({
            where: {
              id: session.id,
            },
            data: {
              status: "IN_PROGRESS",
              pausedAt: null,
            },
          }),

          prisma.adminActionLog.create({
            data: {
              action: "SYSTEM_CHECK_RESUME_STOCKTAKE",
              route: "/admin/system-check",
              adminUserId: auth.user.id,
              targetSessionId: session.id,
              detail: {
                title: session.title,
                previousStatus: session.status,
              },
            },
          }),
        ]);

        return NextResponse.json({
          success: true,
          code: "SYSTEM_REMEDIATION_SESSION_RESUMED",
          message: `「${session.title}」を再開しました。`,
        });
      }

      if (
        session.status === "COMPLETED" ||
        session.status === "CANCELLED"
      ) {
        return NextResponse.json(
          {
            code: "SYSTEM_REMEDIATION_CANCEL_INVALID_STATUS",
            message: "完了済み・取消済みの棚卸は取消できません。",
          },
          { status: 409 }
        );
      }

      await prisma.$transaction([
        prisma.stocktakeSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancelledByUserId: auth.user.id,
            cancellationNote: reason,
            pausedAt: null,
          },
        }),

        prisma.adminActionLog.create({
          data: {
            action: "SYSTEM_CHECK_CANCEL_STOCKTAKE",
            route: "/admin/system-check",
            adminUserId: auth.user.id,
            targetSessionId: session.id,
            detail: {
              title: session.title,
              previousStatus: session.status,
              reason,
            },
          },
        }),

        prisma.notification.create({
          data: {
            type: "STOCKTAKE_CONFLICT",
            audience: "ADMIN",
            title: "管理者が棚卸を取り消しました",
            message: `「${session.title}」を取り消しました。理由：${reason}`,
            stocktakeSessionId: session.id,
            detail: {
              cancelledBy: auth.user.displayName,
              reason,
            },
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        code: "SYSTEM_REMEDIATION_SESSION_CANCELLED",
        message: `「${session.title}」を取り消しました。保存済みの棚卸入力は監査用に保持されています。`,
      });
    }

    if (action === "ISSUE_SYSTEM_BARCODE") {
      const itemId =
        typeof input.itemId === "string" ? input.itemId : "";

      if (!itemId) {
        return NextResponse.json(
          {
            code: "SYSTEM_REMEDIATION_ITEM_ID_REQUIRED",
            message: "商品を指定してください。",
          },
          { status: 400 }
        );
      }

      const item = await prisma.item.findUnique({
        where: {
          id: itemId,
        },
        select: {
          id: true,
          name: true,
          janCode: true,
          systemBarcode: true,
        },
      });

      if (!item) {
        return NextResponse.json(
          {
            code: "SYSTEM_REMEDIATION_ITEM_404",
            message: "商品が見つかりません。",
          },
          { status: 404 }
        );
      }

      if (item.janCode) {
        return NextResponse.json(
          {
            code: "SYSTEM_REMEDIATION_JAN_EXISTS",
            message: "この商品にはJANが登録されています。システムバーコードは不要です。",
          },
          { status: 409 }
        );
      }

      if (item.systemBarcode) {
        return NextResponse.json({
          success: true,
          code: "SYSTEM_REMEDIATION_SYSTEM_BARCODE_EXISTS",
          message: "この商品にはシステムバーコードが発行済みです。",
          systemBarcode: item.systemBarcode,
        });
      }

      const systemBarcode = await issueUniqueSystemBarcode();

      await prisma.$transaction([
        prisma.item.update({
          where: {
            id: item.id,
          },
          data: {
            systemBarcode,
          },
        }),

        prisma.adminActionLog.create({
          data: {
            action: "SYSTEM_CHECK_ISSUE_SYSTEM_BARCODE",
            route: "/admin/system-check",
            adminUserId: auth.user.id,
            targetUserId: null,
            detail: {
              itemId: item.id,
              itemName: item.name,
              systemBarcode,
            },
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        code: "SYSTEM_REMEDIATION_SYSTEM_BARCODE_ISSUED",
        message: `「${item.name}」にシステムバーコードを発行しました。`,
        systemBarcode,
      });
    }

    return NextResponse.json(
      {
        code: "SYSTEM_REMEDIATION_ACTION_INVALID",
        message: "指定された管理操作は実行できません。",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("PATCH /api/admin/system-check/remediate", error);

    return NextResponse.json(
      {
        code: "SYSTEM_REMEDIATION_FAILED",
        message: getErrorMessage(
          error,
          "管理者による復旧操作を実行できませんでした。"
        ),
      },
      { status: 500 }
    );
  }
}
