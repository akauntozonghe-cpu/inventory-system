import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
        { message: "棚卸セッションが見つかりません" },
        { status: 404 }
      );
    }

    const [targets, records] = await Promise.all([
      prisma.stocktakeTarget.findMany({
        where: { sessionId: id },
        select: {
          inventoryInstanceId: true,
          expectedQuantity: true,
          inventoryInstance: {
            select: {
              item: {
                select: {
                  name: true,
                  janCode: true,
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
        where: { sessionId: id },
        select: {
          inventoryInstanceId: true,
          countedQuantity: true,
        },
      }),
    ]);

    const recordByInventoryId = new Map(
      records.map((record) => [
        record.inventoryInstanceId,
        record.countedQuantity,
      ])
    );

    const items = targets.map((target) => {
      const countedQuantity =
        recordByInventoryId.get(target.inventoryInstanceId) ?? null;

      return {
        id: target.inventoryInstanceId,
        name: target.inventoryInstance.item.name,
        janCode: target.inventoryInstance.item.janCode,
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
      (item) => item.difference !== 0
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
    console.error(error);

    return NextResponse.json(
      { message: "棚卸結果の取得に失敗しました" },
      { status: 500 }
    );
  }
}