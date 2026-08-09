import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getLoggedInUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const result = text(value);
  return result === "" ? null : result;
}

function createSystemBarcode() {
  return `SYS-${randomUUID()
    .replace(/-/g, "")
    .slice(0, 16)
    .toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  const currentUser = getLoggedInUser(request);

  if (!currentUser) {
    return NextResponse.json(
      {
        code: "ITEM_REGISTER_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const body: unknown = await request.json();

    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_BODY_400",
          message: "登録内容の形式が正しくありません。",
        },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;

    const name = text(data.name);
    const janCode = optionalText(data.janCode);
    const managementCode = optionalText(data.managementCode);
    const requestedSystemBarcode = optionalText(
      data.systemBarcode
    );
    const storageLocationId = optionalText(data.storageLocationId);
    const lotNo = optionalText(data.lotNo);
    const expirationDate = optionalText(data.expirationDate);
    const unit = optionalText(data.unit);
    const manufacturer = optionalText(data.manufacturer);
    const majorCategory = optionalText(data.majorCategory);
    const minorCategory = optionalText(data.minorCategory);
    const managementGroupCode = optionalText(
      data.managementGroupCode
    );

    const quantity = Number(data.quantity ?? 0);

    if (!name) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_NAME_400",
          message: "商品名を入力してください。",
        },
        { status: 400 }
      );
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_QUANTITY_400",
          message: "初期在庫は0以上の整数で入力してください。",
        },
        { status: 400 }
      );
    }

    if (storageLocationId) {
      const location = await prisma.storageLocation.findUnique({
        where: { id: storageLocationId },
        select: { id: true },
      });

      if (!location) {
        return NextResponse.json(
          {
            code: "ITEM_REGISTER_LOCATION_404",
            message: "選択した保管場所が見つかりません。",
          },
          { status: 404 }
        );
      }
    }

    const systemBarcode =
      requestedSystemBarcode ?? createSystemBarcode();

    const result = await prisma.$transaction(async (tx) => {
      if (janCode) {
        const sameJanItem = await tx.item.findFirst({
          where: { janCode },
          select: {
            id: true,
            name: true,
          },
        });

        if (sameJanItem) {
          throw new Error(
            `同じJANコードの商品が登録済みです：${sameJanItem.name}`
          );
        }
      }

      const sameSystemBarcode = await tx.item.findUnique({
        where: { systemBarcode },
        select: { id: true },
      });

      if (sameSystemBarcode) {
        throw new Error(
          "同じシステムバーコードの商品が登録済みです。"
        );
      }

      if (managementCode) {
        const sameManagementCode = await tx.item.findUnique({
          where: { managementCode },
          select: { id: true },
        });

        if (sameManagementCode) {
          throw new Error(
            "同じ管理コードの商品が登録済みです。"
          );
        }
      }

      const item = await tx.item.create({
        data: {
          name,
          janCode,
          systemBarcode,
          managementCode,
          managementGroupCode,
          manufacturer,
          majorCategory,
          minorCategory,
          defaultUnit: unit,
        },
      });

      const inventory = await tx.inventoryInstance.create({
        data: {
          itemId: item.id,
          storageLocationId,
          managementCode,
          managementGroupCode,
          manufacturer,
          majorCategory,
          minorCategory,
          lotNo,
          expirationDate,
          unit,
          quantity,
          actualQuantity: quantity,
          allocationType: "home",
          status: "在庫中",
        },
        include: {
          item: true,
          storageLocation: true,
        },
      });

      await tx.inventoryHistory.create({
        data: {
          inventoryInstanceId: inventory.id,
          changeQuantity: quantity,
          action: "商品登録",
        },
      });

      return {
        item,
        inventory,
      };
    });

    return NextResponse.json(
      {
        success: true,
        message: "商品と初期在庫を登録しました。",
        ...result,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/items/register", error);

    const message =
      error instanceof Error
        ? error.message
        : "商品登録に失敗しました。";

    const duplicate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002";

    return NextResponse.json(
      {
        code: duplicate
          ? "ITEM_REGISTER_DUPLICATE_409"
          : "ITEM_REGISTER_500",
        message: duplicate
          ? "重複するコードがあるため登録できません。"
          : message,
      },
      {
        status: duplicate ? 409 : 400,
      }
    );
  }
}