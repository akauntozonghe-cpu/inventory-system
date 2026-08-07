import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      inventoryInstanceId,
      quantity,
      action,
    } = body;

    if (
      !inventoryInstanceId ||
      quantity === undefined
    ) {
      return NextResponse.json(
        {
          error: "必要なデータが不足しています。",
        },
        {
          status: 400,
        }
      );
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const before =
          await tx.inventoryInstance.findUnique({
            where: {
              id: inventoryInstanceId,
            },
          });

        if (!before) {
          throw new Error(
            "在庫が見つかりません。"
          );
        }

        const updated =
          await tx.inventoryInstance.update({
            where: {
              id: inventoryInstanceId,
            },
            data: {
              quantity: Number(quantity),
            },
          });

        await tx.inventoryHistory.create({
          data: {
            inventoryInstanceId,
            changeQuantity:
              Number(quantity) -
              before.quantity,
            action:
              action ?? "棚卸修正",
          },
        });

        return updated;
      }
    );

    return NextResponse.json({
      success: true,
      inventory: result,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "更新に失敗しました。",
      },
      {
        status: 500,
      }
    );
  } finally {
    await prisma.$disconnect();
  }
}