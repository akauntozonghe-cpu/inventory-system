import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RegisterItemBody = {
  sessionId?: unknown;
  name?: unknown;
  janCode?: unknown;
  systemBarcode?: unknown;
  managementCode?: unknown;
  managementGroupCode?: unknown;
  manufacturer?: unknown;
  majorCategory?: unknown;
  minorCategory?: unknown;
  unit?: unknown;
  storageLocationId?: unknown;
  quantity?: unknown;
  lotNo?: unknown;
  expirationDate?: unknown;
};

function getText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function getOptionalText(value: unknown, maxLength = 500) {
  return getText(value, maxLength) || null;
}

function getQuantity(value: unknown) {
  const quantity = Number(value);

  if (!Number.isInteger(quantity) || quantity < 0) {
    return null;
  }

  return quantity;
}

function createSystemBarcode() {
  return `SYS-${randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RegisterItemBody;

    const sessionId = getText(body.sessionId, 100);
    const name = getText(body.name, 200);
    const janCode = getOptionalText(body.janCode, 30);
    const systemBarcode = getOptionalText(body.systemBarcode, 100);
    const managementCode = getOptionalText(body.managementCode, 100);
    const storageLocationId = getText(body.storageLocationId, 100);
    const quantity = getQuantity(body.quantity);

    if (!sessionId) {
      return NextResponse.json(
        {
          code: "REGISTER_ITEM_SESSION_400",
          message: "棚卸セッションが指定されていません。",
        },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        {
          code: "REGISTER_ITEM_NAME_400",
          message: "商品名を入力してください。",
        },
        { status: 400 }
      );
    }

    if (!storageLocationId) {
      return NextResponse.json(
        {
          code: "REGISTER_ITEM_LOCATION_400",
          message: "保管場所を選択してください。",
        },
        { status: 400 }
      );
    }

    if (quantity === null) {
      return NextResponse.json(
        {
          code: "REGISTER_ITEM_QUANTITY_400",
          message: "在庫数は0以上の整数で入力してください。",
        },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(
      async (transaction) => {
        const session = await transaction.stocktakeSession.findUnique({
          where: {
            id: sessionId,
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (!session) {
          throw new Error("棚卸セッションが見つかりません。");
        }

        if (session.status !== "IN_PROGRESS") {
          throw new Error(
            "棚卸中ではないため、新しい商品を棚卸対象へ追加できません。"
          );
        }

        const location = await transaction.storageLocation.findUnique({
          where: {
            id: storageLocationId,
          },
          select: {
            id: true,
            name: true,
          },
        });

        if (!location) {
          throw new Error("選択した保管場所が見つかりません。");
        }

        let item = null;

        if (managementCode) {
          item = await transaction.item.findUnique({
            where: {
              managementCode,
            },
          });
        }

        if (!item && janCode) {
          item = await transaction.item.findFirst({
            where: {
              janCode,
            },
            orderBy: {
              createdAt: "asc",
            },
          });
        }

        if (!item && systemBarcode) {
          item = await transaction.item.findUnique({
            where: {
              systemBarcode,
            },
          });
        }

        if (!item) {
          item = await transaction.item.create({
            data: {
              name,
              janCode,
              systemBarcode:
                systemBarcode ??
                (!janCode ? createSystemBarcode() : null),
              managementCode,
              managementGroupCode: getOptionalText(
                body.managementGroupCode,
                100
              ),
              manufacturer: getOptionalText(body.manufacturer, 200),
              majorCategory: getOptionalText(body.majorCategory, 100),
              minorCategory: getOptionalText(body.minorCategory, 100),
              defaultUnit: getOptionalText(body.unit, 30),
            },
          });
        }

        const lotNo = getOptionalText(body.lotNo, 100);
        const expirationDate = getOptionalText(body.expirationDate, 30);
        const unit = getOptionalText(body.unit, 30) ?? item.defaultUnit;

        let inventory = await transaction.inventoryInstance.findFirst({
          where: {
            itemId: item.id,
            storageLocationId,
            lotNo,
            expirationDate,
          },
        });

        if (inventory) {
          inventory = await transaction.inventoryInstance.update({
            where: {
              id: inventory.id,
            },
            data: {
              quantity: inventory.quantity + quantity,
              actualQuantity:
                inventory.actualQuantity === null
                  ? inventory.quantity + quantity
                  : inventory.actualQuantity + quantity,
              unit,
              status: "保管中",
            },
          });
        } else {
          inventory = await transaction.inventoryInstance.create({
            data: {
              itemId: item.id,
              storageLocationId,
              managementCode: item.managementCode,
              managementGroupCode: item.managementGroupCode,
              manufacturer: item.manufacturer,
              majorCategory: item.majorCategory,
              minorCategory: item.minorCategory,
              lotNo,
              expirationDate,
              unit,
              quantity,
              actualQuantity: quantity,
              allocationType: "home",
              status: "保管中",
              stocktakeStatus: "未棚卸",
            },
          });
        }

        await transaction.inventoryHistory.create({
          data: {
            inventoryInstanceId: inventory.id,
            changeQuantity: quantity,
            action: "棚卸中の未登録商品追加",
          },
        });

        const target = await transaction.stocktakeTarget.upsert({
          where: {
            sessionId_inventoryInstanceId: {
              sessionId,
              inventoryInstanceId: inventory.id,
            },
          },
          update: {
            expectedQuantity: inventory.quantity,
          },
          create: {
            sessionId,
            inventoryInstanceId: inventory.id,
            expectedQuantity: inventory.quantity,
          },
          include: {
            inventoryInstance: {
              include: {
                item: true,
                storageLocation: true,
              },
            },
          },
        });

        return {
          target: {
            id: target.inventoryInstance.id,
            expectedQuantity: target.expectedQuantity,
            isRecorded: false,
            countedQuantity: null,
            item: {
              id: target.inventoryInstance.item.id,
              name: target.inventoryInstance.item.name,
              janCode: target.inventoryInstance.item.janCode,
              systemBarcode: target.inventoryInstance.item.systemBarcode,
              managementCode: target.inventoryInstance.item.managementCode,
            },
            storageLocation: target.inventoryInstance.storageLocation
              ? {
                  id: target.inventoryInstance.storageLocation.id,
                  name: target.inventoryInstance.storageLocation.name,
                }
              : null,
          },
          created: {
            itemId: item.id,
            inventoryInstanceId: inventory.id,
            locationName: location.name,
          },
        };
      },
      {
        maxWait: 10_000,
        timeout: 20_000,
      }
    );

    return NextResponse.json(
      {
        success: true,
        ...result,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/stocktake/register-item", error);

    return NextResponse.json(
      {
        code: "REGISTER_ITEM_500",
        message:
          error instanceof Error
            ? error.message
            : "未登録商品の登録に失敗しました。",
      },
      { status: 500 }
    );
  }
}