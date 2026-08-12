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
        code: "STOCKTAKE_RESULT_AUTH_401",
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
        completedAt: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_RESULT_SESSION_404",
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
          code: "STOCKTAKE_RESULT_FORBIDDEN",
          message: "この棚卸結果を表示する権限がありません。",
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
          inventoryInstance: {
            select: {
              id: true,
              lotNo: true,
              expirationDate: true,
              unit: true,
              storageLocation: {
                select: {
                  name: true,
                },
              },
              item: {
                select: {
                  name: true,
                  janCode: true,
                  systemBarcode: true,
                  manufacturer: true,
                  majorCategory: true,
                  minorCategory: true,
                  defaultUnit: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      }),

      prisma.stocktakeRecord.findMany({
        where: {
          sessionId,
        },
        select: {
          id: true,
          inventoryInstanceId: true,
          countedQuantity: true,
          memo: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
    ]);

    const targetMap = new Map(
      targets.map((target) => [target.inventoryInstanceId, target])
    );

    const recordsWithDetail = records
      .map((record) => {
        const target = targetMap.get(record.inventoryInstanceId);

        if (!target) {
          return null;
        }

        const inventory = target.inventoryInstance;
        const unit = inventory.unit ?? inventory.item.defaultUnit;

        return {
          id: record.id,
          inventoryInstanceId: record.inventoryInstanceId,
          expectedQuantity: target.expectedQuantity,
          countedQuantity: record.countedQuantity,
          difference: record.countedQuantity - target.expectedQuantity,
          memo: record.memo,
          recordedAt: record.updatedAt.toISOString(),
          lotNo: inventory.lotNo,
          expirationDate: inventory.expirationDate,
          unit,
          storageLocation: inventory.storageLocation
            ? {
                name: inventory.storageLocation.name,
              }
            : null,
          item: {
            name: inventory.item.name,
            janCode: inventory.item.janCode,
            systemBarcode: inventory.item.systemBarcode,
            manufacturer: inventory.item.manufacturer,
            majorCategory: inventory.item.majorCategory,
            minorCategory: inventory.item.minorCategory,
          },
        };
      })
      .filter(
        (
          record
        ): record is NonNullable<typeof record> => record !== null
      );

    const recordedCount = recordsWithDetail.length;
    const matchedCount = recordsWithDetail.filter(
      (record) => record.difference === 0
    ).length;
    const differenceCount = recordedCount - matchedCount;
    const targetCount = targets.length;
    const unrecordedCount = Math.max(targetCount - recordedCount, 0);

    return NextResponse.json({
      success: true,
      code: "STOCKTAKE_RESULT_OK",

      session: {
        id: session.id,
        title: session.title,
        operator: session.operator,
        scopeLabel: session.scopeLabel,
        status: session.status,
        startedAt: session.startedAt.toISOString(),
        completedAt: session.completedAt?.toISOString() ?? null,
      },

      permissions: {
        isOperator,
        isAdmin,
        canApply:
          (isOperator || isAdmin) && session.status === "REVIEW",
      },

      summary: {
        targetCount,
        recordedCount,
        matchedCount,
        differenceCount,
        unrecordedCount,
      },

      records: recordsWithDetail,
    });
  } catch (error) {
    console.error("GET /api/stocktake/session/[id]/result", error);

    return NextResponse.json(
      {
        code: "STOCKTAKE_RESULT_FAILED",
        message: getErrorMessage(
          error,
          "棚卸結果の取得に失敗しました。"
        ),
      },
      { status: 500 }
    );
  }
}