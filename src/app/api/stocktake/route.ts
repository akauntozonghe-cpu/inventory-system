import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {

  try {

    const body = await req.json();

    const existing =
  await prisma.inventoryInstance.findFirst({
    where: {
      itemId: body.itemId,
      storageLocationId: body.storageLocationId || null,
      lotNo: body.lotNo || null,
      expirationDate: body.expirationDate || null,
    },
  });

    let inventory;

    if (existing) {

      inventory =
        await prisma.inventoryInstance.update({

          where: {

            id:
              existing.id,

          },

          data: {

            quantity:
              Number(body.quantity),

            actualQuantity:
              Number(body.quantity),

            status:
              "保管中",

          },

        });

    } else {

      inventory =
        await prisma.inventoryInstance.create({

          data: {

            itemId:
              body.itemId,

            storageLocationId:
              body.storageLocationId,

            quantity:
              Number(body.quantity),

            actualQuantity:
              Number(body.quantity),

            allocationType:
              "home",

            status:
              "保管中",

          },

        });

    }

    await prisma.inventoryHistory.create({

      data: {

        inventoryInstanceId:
          inventory.id,

        action:
          "初回棚卸",

        changeQuantity:
          Number(body.quantity),

      },

    });

    return NextResponse.json({

      success: true,

      inventory,

    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(

      {

        message:
          "棚卸保存失敗",

      },

      {

        status: 500,

      }

    );

  }

}