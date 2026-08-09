import { NextRequest, NextResponse } from "next/server";
import { getLoggedInUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "RESULT_AUTH_401",
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
        status: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          code: "RESULT_SESSION_404",
          message: "棚卸セッションが見つかりません。",
        },
        { status: 404 }
      );
    }

    const [targets, records] = await Promise.all([
      prisma.stocktakeTarget.findMany({
        where: {
          sessionId: id,
        },
        orderBy: {
          createdAt: "asc",
        },
        include: {
          inventoryInstance: {
            include: {
              item: {
                select: {
                  name: true,
                  janCode: true,
                  systemBarcode: true,
                },
              },
              storageLocation: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),

      prisma.stocktakeRecord.findMany({
        where: {
          sessionId: id,
        },
        select: {
          inventoryInstanceId: true,
          countedQuantity: true,
        },
      }),
    ]);

    const countedByInventoryId = new Map<string, number>();

    for (const record of records) {
      countedByInventoryId.set(
        record.inventoryInstanceId,
        record.countedQuantity
      );
    }

    const items = targets.map((target) => {
      const countedQuantity =
        countedByInventoryId.get(target.inventoryInstanceId) ?? null;

      return {
        id: target.inventoryInstanceId,
        name: target.inventoryInstance.item.name,
        janCode:
          target.inventoryInstance.item.janCode ??
          target.inventoryInstance.item.systemBarcode,
        location:
          target.inventoryInstance.storageLocation?.name ?? "未設定",
        expectedQuantity: target.expectedQuantity,
        countedQuantity,
        difference:
          countedQuantity === null
            ? null
            : countedQuantity - target.expectedQuantity,
      };
    });

    const recordedItems = items.filter(
      (item) => item.countedQuantity !== null
    );

    const matchedCount = recordedItems.filter(
      (item) => item.difference === 0
    ).length;

    const differenceCount = recordedItems.filter(
      (item) =>
        item.difference !== null &&
        item.difference !== 0
    ).length;

    return NextResponse.json({
      session,
      summary: {
        targetCount: items.length,
        recordedCount: recordedItems.length,
        matchedCount,
        differenceCount,
        unrecordedCount: items.length - recordedItems.length,
      },
      items,
    });
  } catch (error) {
    console.error("GET /api/stocktake/session/[id]/result", error);

    const prismaErrorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : null;

    return NextResponse.json(
      {
        code: prismaErrorCode
          ? `RESULT_DATABASE_${prismaErrorCode}`
          : "RESULT_FETCH_500",
        message: "棚卸結果の取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}