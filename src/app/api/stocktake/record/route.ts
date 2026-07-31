import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const record = await prisma.stocktakeRecord.upsert({
      where: {
        sessionId_inventoryInstanceId: {
          sessionId: body.sessionId,
          inventoryInstanceId: body.inventoryInstanceId,
        },
      },
      update: {
        countedQuantity: body.countedQuantity,
        memo: body.memo ?? null,
      },
      create: {
        sessionId: body.sessionId,
        inventoryInstanceId: body.inventoryInstanceId,
        countedQuantity: body.countedQuantity,
        memo: body.memo ?? null,
      },
    });

    await prisma.inventoryInstance.update({
      where: {
        id: body.inventoryInstanceId,
      },
      data: {
        actualQuantity: body.countedQuantity,
        stocktakeStatus: "棚卸済",
        stocktakeAt: new Date(),
      },
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "保存に失敗しました" },
      { status: 500 }
    );
  }
}