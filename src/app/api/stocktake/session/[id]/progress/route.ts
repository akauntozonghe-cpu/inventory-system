import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await prisma.stocktakeSession.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        title: true,
        scopeType: true,
        scopeValue: true,
        scopeLabel: true,
        status: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { message: "棚卸セッションが見つかりません" },
        { status: 404 }
      );
    }

    const existingTargetCount = await prisma.stocktakeTarget.count({
      where: {
        sessionId: id,
      },
    });

    // 対象在庫を保存する機能の追加前に作られた棚卸だけを補完する。
    if (existingTargetCount === 0) {
      const inventoryWhere: Prisma.InventoryInstanceWhereInput = {};

      if (session.scopeType === "LOCATION" && session.scopeValue) {
        inventoryWhere.storageLocationId = session.scopeValue;
      }

      if (session.scopeType === "MAJOR_CATEGORY" && session.scopeValue) {
        inventoryWhere.item = {
          majorCategory: session.scopeValue,
        };
      }

      if (session.scopeType === "MINOR_CATEGORY" && session.scopeValue) {
        inventoryWhere.item = {
          minorCategory: session.scopeValue,
        };
      }

      const inventories = await prisma.inventoryInstance.findMany({
        where: inventoryWhere,
        select: {
          id: true,
          quantity: true,
        },
      });

      if (inventories.length > 0) {
        await prisma.stocktakeTarget.createMany({
          data: inventories.map((inventory) => ({
            sessionId: id,
            inventoryInstanceId: inventory.id,
            expectedQuantity: inventory.quantity,
          })),
          skipDuplicates: true,
        });
      }
    }

    const [targets, records] = await Promise.all([
      prisma.stocktakeTarget.findMany({
        where: {
          sessionId: id,
        },
        select: {
          inventoryInstanceId: true,
          expectedQuantity: true,
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

    const expectedQuantityByInventoryId = new Map(
      targets.map((target) => [
        target.inventoryInstanceId,
        target.expectedQuantity,
      ])
    );

    const matchedCount = records.filter(
      (record) =>
        expectedQuantityByInventoryId.get(record.inventoryInstanceId) ===
        record.countedQuantity
    ).length;

    const targetCount = targets.length;
    const recordedCount = records.length;
    const differenceCount = recordedCount - matchedCount;
    const unrecordedCount = Math.max(targetCount - recordedCount, 0);

    return NextResponse.json({
      session,
      summary: {
        targetCount,
        recordedCount,
        matchedCount,
        differenceCount,
        unrecordedCount,
        progressPercent:
          targetCount === 0
            ? 0
            : Math.round((recordedCount / targetCount) * 100),
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "棚卸進捗の取得に失敗しました" },
      { status: 500 }
    );
  }
}