import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await prisma.stocktakeSession.findUnique({
      where: { id },
      include: {
        targets: {
          include: {
            inventoryInstance: { include: { item: true, storageLocation: true } },
          },
        },
        records: true,
      },
    });
    if (!session) return NextResponse.json({ message: "棚卸が見つかりません" }, { status: 404 });
    const recordMap = new Map(session.records.map((record) => [record.inventoryInstanceId, record]));
    const items = session.targets.map((target) => {
      const record = recordMap.get(target.inventoryInstanceId);
      const countedQuantity = record?.countedQuantity ?? null;
      return {
        id: target.inventoryInstanceId,
        name: target.inventoryInstance.item.name,
        janCode: target.inventoryInstance.item.janCode,
        location: target.inventoryInstance.storageLocation?.name ?? "-",
        expectedQuantity: target.expectedQuantity,
        countedQuantity,
        difference: countedQuantity === null ? null : countedQuantity - target.expectedQuantity,
      };
    });
    return NextResponse.json({
      session: { id: session.id, title: session.title, status: session.status },
      summary: {
        targetCount: items.length,
        recordedCount: items.filter((item) => item.countedQuantity !== null).length,
        matchedCount: items.filter((item) => item.difference === 0).length,
        differenceCount: items.filter((item) => item.difference !== null && item.difference !== 0).length,
        unrecordedCount: items.filter((item) => item.countedQuantity === null).length,
      },
      items,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "結果を取得できませんでした" }, { status: 500 });
  }
}
