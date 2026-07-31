import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const inventories =
      await prisma.inventoryInstance.findMany({
        include: {
          item: true,
          storageLocation: true,
          histories: {
            orderBy: {
              createdAt: "desc",
            },
            take: 10,
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

    return NextResponse.json(inventories);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "在庫取得失敗",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.itemId) {
      return NextResponse.json(
        {
          message: "商品が選択されていません。",
        },
        {
          status: 400,
        }
      );
    }

    const item = await prisma.item.findUnique({
      where: {
        id: body.itemId,
      },
    });

    if (!item) {
      return NextResponse.json(
        {
          message: "商品が存在しません。",
        },
        {
          status: 404,
        }
      );
    }

    const existing =
  await prisma.inventoryInstance.findFirst({
    where: {
      itemId: body.itemId,
      storageLocationId: body.storageLocationId || null,
      lotNo: body.lotNo || null,
      expirationDate: body.expirationDate || null,
    },
  });

    if (existing) {
      const inventory =
        await prisma.inventoryInstance.update({
          where: {
            id: existing.id,
          },
          data: {
            quantity:
              Number(body.quantity),

            actualQuantity:
              Number(body.quantity),

            storageLocationId:
              body.storageLocationId || null,

            status:
              body.status ?? "保管中",

            allocationType:
              body.allocationType ?? "home",

            lotNo:
              body.lotNo ?? null,

            expirationDate:
              body.expirationDate ?? null,

            unit:
              body.unit ?? item.defaultUnit,
          },
          include: {
            item: true,
            storageLocation: true,
          },
        });
      
        await prisma.inventoryHistory.create({
  data: {
    inventoryInstanceId: inventory.id,
    changeQuantity: Number(body.quantity),
    action: "棚卸",
  },
});
      return NextResponse.json(inventory);
    }

    const inventory =
      await prisma.inventoryInstance.create({
        data: {
          itemId:
            body.itemId,

          storageLocationId:
            body.storageLocationId || null,

          managementCode:
            item.managementCode,

          managementGroupCode:
            item.managementGroupCode,

          quantity:
            Number(body.quantity),

          actualQuantity:
            Number(body.quantity),

          allocationType:
            body.allocationType ?? "home",

          status:
            body.status ?? "保管中",

          lotNo:
            body.lotNo ?? null,

          expirationDate:
            body.expirationDate ?? null,

          unit:
            body.unit ?? item.defaultUnit,
        },
        include: {
          item: true,
          storageLocation: true,
        },
      });

    await prisma.inventoryHistory.create({
      data: {
        inventoryInstanceId:
          inventory.id,
        changeQuantity:
          Number(body.quantity),
        action:
          "初回棚卸",
      },
    });

    return NextResponse.json(inventory);

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        message: "棚卸保存に失敗しました。",
      },
      {
        status: 500,
      }
    );

  }
}

export async function PUT(req: Request) {
  try {

    const body = await req.json();

    const before =
      await prisma.inventoryInstance.findUnique({
        where: {
          id: body.id,
        },
      });

    if (!before) {
      return NextResponse.json(
        {
          message: "在庫がありません",
        },
        {
          status: 404,
        }
      );
    }

    const inventory =
      await prisma.inventoryInstance.update({
        where: {
          id: body.id,
        },
        data: {
          quantity:
            Number(body.quantity),

          actualQuantity:
            body.actualQuantity,

          storageLocationId:
            body.storageLocationId,

          lotNo:
            body.lotNo,

          expirationDate:
            body.expirationDate,

          status:
            body.status,

          allocationType:
            body.allocationType,
        },
      });

    await prisma.inventoryHistory.create({
      data: {
        inventoryInstanceId:
          inventory.id,

        changeQuantity:
          inventory.quantity -
          before.quantity,

        action:
          "在庫更新",
      },
    });

    return NextResponse.json(inventory);

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        message: "更新失敗",
      },
      {
        status: 500,
      }
    );

  }
}

export async function DELETE(req: Request) {

  try {

    const { searchParams } =
      new URL(req.url);

    const id =
      searchParams.get("id");

    if (!id) {

      return NextResponse.json(
        {
          message: "IDなし",
        },
        {
          status: 400,
        }
      );

    }

    await prisma.inventoryInstance.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      success: true,
    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        message: "削除失敗",
      },
      {
        status: 500,
      }
    );

  }

}