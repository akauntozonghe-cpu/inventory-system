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

    const [targets, records] = await Promise.all([
      prisma.stocktakeTarget.findMany({
        where: { sessionId: id },
        select: {
          inventoryInstanceId: true,
          expectedQuantity: true,
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

    const expectedByInventoryId = new Map(
      targets.map((target) => [
        target.inventoryInstanceId,
        target.expectedQuantity,
      ])
    );

    const matchedCount = records.filter(
      (record) =>
        expectedByInventoryId.get(record.inventoryInstanceId) ===
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
      { message: "進捗の取得に失敗しました" },
      { status: 500 }
    );
  }
}