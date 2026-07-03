import { prisma } from "@/lib/prisma";

import { NextResponse } from "next/server";

export async function GET() {
  try {
    const inventory =
      await prisma.inventoryInstance.findMany({
        include: {
          item: true,

          histories: true,

          storageLocation: true,
        },

        orderBy: {
          createdAt: "desc",
        },
      });

    return NextResponse.json(
      inventory
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "取得失敗",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  req: Request
) {
  try {
    const body =
      await req.json();

    const inventory =
      await prisma.inventoryInstance.create({
        data: {
          itemId:
            body.itemId,

          quantity:
            Number(
              body.quantity
            ),

          actualQuantity:
            body.actualQuantity ??
            null,

          allocationType:
            body.allocationType,

          status:
            body.status ??
            "active",

          storageLocationId:
            body.storageLocationId,

          managementCode:
            body.managementCode,

          managementGroupCode:
            body.managementGroupCode,

          lotNo:
            body.lotNo,

          expirationDate:
            body.expirationDate,

          unit:
            body.unit,
        },

        include: {
          item: true,

          histories: true,

          storageLocation: true,
        },
      });

    await prisma.inventoryHistory.create({
      data: {
        inventoryInstanceId:
          inventory.id,

        changeQuantity:
          Number(
            body.quantity
          ),

        action:
          "create",
      },
    });

    return NextResponse.json(
      inventory
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "登録失敗",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(
  req: Request
) {
  try {
    const body =
      await req.json();

    const current =
      await prisma.inventoryInstance.findUnique({
        where: {
          id: body.id,
        },
      });

    if (!current) {
      return NextResponse.json(
        {
          error:
            "Not found",
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
            body.quantity !==
            undefined
              ? Number(
                  body.quantity
                )
              : current.quantity,

          actualQuantity:
            body.actualQuantity !==
            undefined
              ? Number(
                  body.actualQuantity
                )
              : current.actualQuantity,

          allocationType:
            body.allocationType ??
            current.allocationType,

          storageLocationId:
            body.storageLocationId ??
            current.storageLocationId,

          managementCode:
            body.managementCode ??
            current.managementCode,

          managementGroupCode:
            body.managementGroupCode ??
            current.managementGroupCode,

          lotNo:
            body.lotNo ??
            current.lotNo,

          expirationDate:
            body.expirationDate ??
            current.expirationDate,

          unit:
            body.unit ??
            current.unit,

          status:
            body.actualQuantity !==
            undefined
              ? (
                  Number(
                    body.actualQuantity
                  ) ===
                  current.quantity
                    ? "checked"
                    : "difference"
                )
              : current.status,
        },

        include: {
          item: true,

          histories: true,

          storageLocation: true,
        },
      });

    await prisma.inventoryHistory.create({
      data: {
        inventoryInstanceId:
          inventory.id,

        changeQuantity:
          body.actualQuantity !==
          undefined
            ? Number(
                body.actualQuantity
              ) -
              current.quantity
            : Number(
                body.quantity
              ) -
              current.quantity,

        action:
          body.actualQuantity !==
          undefined
            ? "stocktake"
            : "update",
      },
    });

    return NextResponse.json(
      inventory
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "更新失敗",
      },
      {
        status: 500,
      }
    );
  }
}