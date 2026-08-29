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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "STOCKTAKE_APPLY_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const { id: sessionId } = await params;

    const session = await prisma.stocktakeSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        title: true,
        status: true,
        operatorUserId: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_APPLY_SESSION_404",
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
          code: "STOCKTAKE_APPLY_FORBIDDEN",
          message: "この棚卸を確定する権限がありません。",
        },
        { status: 403 }
      );
    }

    if (session.status === "COMPLETED") {
      return NextResponse.json({
        success: true,
        code: "STOCKTAKE_APPLY_ALREADY_COMPLETED",
        message: "この棚卸はすでに正式確定済みです。",
      });
    }

    if (session.status !== "REVIEW") {
      return NextResponse.json(
        {
          code: "STOCKTAKE_APPLY_NOT_REVIEW",
          message:
            "棚卸作業を終了して結果を確認してから、正式確定してください。",
        },
        { status: 409 }
      );
    }

    const records = await prisma.stocktakeRecord.findMany({
      where: { sessionId },
      select: {
        inventoryInstanceId: true,
        countedQuantity: true,
      },
    });

    if (records.length === 0) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_APPLY_RECORD_EMPTY",
          message: "保存済みの棚卸入力がありません。",
        },
        { status: 409 }
      );
    }

    const inventoryIds = records.map((record) => record.inventoryInstanceId);

    const inventories = await prisma.inventoryInstance.findMany({
      where: {
        id: {
          in: inventoryIds,
        },
      },
      select: {
        id: true,
        quantity: true,
      },
    });

    const inventoryMap = new Map(
      inventories.map((inventory) => [inventory.id, inventory])
    );

    const targetsToApply = records
      .map((record) => {
        const inventory = inventoryMap.get(record.inventoryInstanceId);

        if (!inventory) {
          return null;
        }

        return {
          inventoryInstanceId: record.inventoryInstanceId,
          countedQuantity: record.countedQuantity,
          changeQuantity: record.countedQuantity - inventory.quantity,
        };
      })
      .filter(
        (
          target
        ): target is {
          inventoryInstanceId: string;
          countedQuantity: number;
          changeQuantity: number;
        } => target !== null
      );

    if (targetsToApply.length === 0) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_APPLY_INVENTORY_EMPTY",
          message: "反映できる在庫データが見つかりません。",
        },
        { status: 409 }
      );
    }

    const now = new Date();

    await prisma.$transaction(async (transaction) => {
      for (const target of targetsToApply) {
        await transaction.inventoryInstance.update({
          where: {
            id: target.inventoryInstanceId,
          },
          data: {
            quantity: target.countedQuantity,
            actualQuantity: target.countedQuantity,
            stocktakeStatus: "棚卸済",
            stocktakeAt: now,
          },
          // 棚卸確定では返却値を使わない。全列の暗黙取得を避け、
          // 拡張列の移行中でも既存在庫を安全に確定できるようにする。
          select: {
            id: true,
          },
        });

        await transaction.inventoryHistory.create({
          data: {
            inventoryInstanceId: target.inventoryInstanceId,
            changeQuantity: target.changeQuantity,
            action: `棚卸確定：${session.title}`,
          },
        });
      }

      await transaction.stocktakeSession.update({
        where: {
          id: sessionId,
        },
        data: {
          status: "COMPLETED",
          completedAt: now,
          pausedAt: null,
        },
      });
    });

    return NextResponse.json({
      success: true,
      code: "STOCKTAKE_APPLY_COMPLETED",
      message: `「${session.title}」を正式確定しました。在庫へ反映済みです。`,
      summary: {
        recordedCount: records.length,
        updatedInventoryCount: targetsToApply.length,
      },
    });
  } catch (error) {
    console.error("POST /api/stocktake/session/[id]/apply", error);

    return NextResponse.json(
      {
        code: "STOCKTAKE_APPLY_FAILED",
        message: getErrorMessage(
          error,
          "棚卸結果を正式確定できませんでした。時間をおいて再試行してください。"
        ),
      },
      { status: 500 }
    );
  }
}
