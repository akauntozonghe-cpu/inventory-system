import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const result = text(value);
  return result || null;
}

function validQuantity(value: unknown) {
  const quantity = Number(value);

  return Number.isInteger(quantity) && quantity >= 0
    ? quantity
    : null;
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { message: "登録内容の形式が正しくありません。" },
        { status: 400 }
      );
    }

    const input = body as Record<string, unknown>;

    const sessionId = text(input.sessionId);
    const name = text(input.name);
    const janCode = optionalText(input.janCode);
    const managementCode = optionalText(input.managementCode);
    const storageLocationId = optionalText(input.storageLocationId);
    const quantity = validQuantity(input.quantity);

    if (!sessionId) {
      return NextResponse.json(
        { message: "棚卸セッションが指定されていません。" },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { message: "商品名を入力してください。" },
        { status: 400 }
      );
    }

    if (!storageLocationId) {
      return NextResponse.json(
        { message: "保管場所を選択してください。" },
        { status: 400 }
      );
    }

    if (quantity === null) {
      return NextResponse.json(
        { message: "数量は0以上の整数で入力してください。" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.stocktakeSession.findUnique({
        where: { id: sessionId },
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
          "中断中または完了済みの棚卸には商品を追加できません。"
        );
      }

      const location = await tx.storageLocation.findUnique({
        where: { id: storageLocationId },
        select: { id: true },
      });

      if (!location) {
        throw new Error("選択した保管場所が見つかりません。");
      }

      let item = null;

      if (managementCode) {
        item = await tx.item.findUnique({
          where: { managementCode },
        });
      }

      if (!item && janCode) {
        item = await tx.item.findFirst({
          where: { janCode },
          orderBy: { createdAt: "asc" },
        });
      }

      if (!item) {
        item = await tx.item.create({
          data: {
            name,
            janCode,
            managementCode,
            managementGroupCode: optionalText(
              input.managementGroupCode
            ),
            manufacturer: optionalText(input.manufacturer),
            majorCategory: optionalText(input.majorCategory),
            minorCategory: optionalText(input.minorCategory),
            defaultUnit: optionalText(input.unit),
          },
        });
      }

      const lotNo = optionalText(input.lotNo);
      const expirationDate = optionalText(input.expirationDate);

      let inventory = await tx.inventoryInstance.findFirst({
        where: {
          itemId: item.id,
          storageLocationId,
          lotNo,
          expirationDate,
        },
      });

      if (inventory) {
        inventory = await tx.inventoryInstance.update({
          where: { id: inventory.id },
          data: {
            quantity: inventory.quantity + quantity,
            actualQuantity:
              inventory.actualQuantity === null
                ? inventory.quantity + quantity
                : inventory.actualQuantity + quantity,
            unit: optionalText(input.unit) ?? inventory.unit,
            status: "保管中",
          },
        });
      } else {
        inventory = await tx.inventoryInstance.create({
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
            unit: optionalText(input.unit) ?? item.defaultUnit,
            quantity,
            actualQuantity: quantity,
            allocationType: "home",
            status: "保管中",
            stocktakeStatus: "未棚卸",
          },
        });
      }

      await tx.inventoryHistory.create({
        data: {
          inventoryInstanceId: inventory.id,
          changeQuantity: quantity,
          action: "棚卸中の商品・在庫登録",
        },
      });

      await tx.stocktakeTarget.upsert({
        where: {
          sessionId_inventoryInstanceId: {
            sessionId,
            inventoryInstanceId: inventory.id,
          },
        },
        update: {},
        create: {
          sessionId,
          inventoryInstanceId: inventory.id,
          expectedQuantity: inventory.quantity,
        },
      });

      return {
        item: {
          id: item.id,
          name: item.name,
          janCode: item.janCode,
        },
        inventory: {
          id: inventory.id,
          quantity: inventory.quantity,
        },
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("POST /api/stocktake/register-item", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "未登録商品の登録に失敗しました。",
      },
      { status: 400 }
    );
  }
}