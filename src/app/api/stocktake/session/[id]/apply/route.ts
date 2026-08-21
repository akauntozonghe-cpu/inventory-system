import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: Request,
  { params }: Params
) {
  try {
    const { id } = await params;

    const session =
      await prisma.stocktakeSession.findUnique({
        where: {
          id,
        },
        include: {
          records: {
            include: {
              inventoryInstance: true,
            },
          },
        },
      });

    if (!session) {
      return NextResponse.json(
        {
          message: "棚卸セッションが見つかりません。",
        },
        {
          status: 404,
        }
      );
    }

    if (session.status === "COMPLETED") {
      return NextResponse.json(
        {
          message: "すでに反映済みです。",
        },
        {
          status: 400,
        }
      );
    }

    await prisma.$transaction(
      async (tx) => {

        for (const record of session.records) {

          const before =
            record.inventoryInstance.quantity;

          await tx.inventoryInstance.update({
            where: {
              id: record.inventoryInstanceId,
            },
            data: {
              quantity: record.countedQuantity,
              actualQuantity: record.countedQuantity,
              stocktakeStatus: "反映済",
              stocktakeAt: new Date(),
            },
          });

          await tx.inventoryHistory.create({
            data: {
              inventoryInstanceId:
                record.inventoryInstanceId,

              changeQuantity:
                record.countedQuantity -
                before,

              action: "棚卸反映",
            },
          });

        }

        await tx.stocktakeSession.update({
          where: {
            id,
          },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });

      }
    );

    return NextResponse.json({
      success: true,
    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        message: "棚卸反映に失敗しました。",
      },
      {
        status: 500,
      }
    );

  }
}