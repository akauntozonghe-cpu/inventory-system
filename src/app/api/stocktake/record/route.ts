import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const inventoryInstanceId = typeof body.inventoryInstanceId === "string" ? body.inventoryInstanceId : "";
    const countedQuantity = Number(body.countedQuantity);

    if (!sessionId || !inventoryInstanceId || !Number.isInteger(countedQuantity) || countedQuantity < 0) {
      return NextResponse.json({ message: "入力内容を確認してください" }, { status: 400 });
    }

    const record = await prisma.$transaction(async (tx) => {
      const [session, target] = await Promise.all([
        tx.stocktakeSession.findUnique({ where: { id: sessionId }, select: { status: true } }),
        tx.stocktakeTarget.findUnique({
          where: { sessionId_inventoryInstanceId: { sessionId, inventoryInstanceId } },
        }),
      ]);

      if (!session) throw new Error("棚卸セッションが見つかりません");
      if (session.status !== "IN_PROGRESS") throw new Error("この棚卸は入力できません");
      if (!target) throw new Error("この商品は棚卸対象外です");

      const saved = await tx.stocktakeRecord.upsert({
        where: { sessionId_inventoryInstanceId: { sessionId, inventoryInstanceId } },
        update: { countedQuantity },
        create: { sessionId, inventoryInstanceId, countedQuantity },
      });

      await tx.inventoryInstance.update({
        where: { id: inventoryInstanceId },
        data: { actualQuantity: countedQuantity, stocktakeStatus: "棚卸済", stocktakeAt: new Date() },
      });

      return saved;
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "保存に失敗しました" },
      { status: 400 }
    );
  }
}
