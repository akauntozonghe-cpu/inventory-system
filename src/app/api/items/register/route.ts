import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createAdminActionLog } from "@/lib/error-report";

function getText(value: unknown, maxLength = 300) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function getOptionalText(value: unknown, maxLength = 300) {
  return getText(value, maxLength) || null;
}

function createCheckDigit(body: string) {
  let total = 0;

  for (let index = 0; index < body.length; index += 1) {
    total += Number(body[index]) * (index % 2 === 0 ? 1 : 3);
  }

  return String((10 - (total % 10)) % 10);
}

async function createSystemBarcode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const serial = String(
      randomInt(0, 10_000_000_000)
    ).padStart(10, "0");

    const body = `20${serial}`;
    const systemBarcode = `${body}${createCheckDigit(body)}`;

    const exists = await prisma.item.findUnique({
      where: {
        systemBarcode,
      },
      select: {
        id: true,
      },
    });

    if (!exists) {
      return systemBarcode;
    }
  }

  throw new Error("SYSTEM_BARCODE_GENERATE_FAILED");
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const adminUser = auth.user;

  if (!adminUser) {
    return NextResponse.json(
      {
        code: "ADMIN_REQUIRED",
        message: "商品登録には管理者権限が必要です。",
      },
      { status: 403 }
    );
  }

  try {
    const rawBody: unknown = await request.json();

    if (typeof rawBody !== "object" || rawBody === null) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_BODY_400",
          message: "登録内容が正しくありません。",
        },
        { status: 400 }
      );
    }

    const body = rawBody as Record<string, unknown>;

    const name = getText(body.name, 200);
    const janCode = getOptionalText(body.janCode, 30);
    const quantity = Number(body.quantity ?? 0);
    const storageLocationId = getOptionalText(
      body.storageLocationId,
      100
    );
    const generateSystemBarcode =
      body.generateSystemJan === true ||
      body.generateSystemBarcode === true;

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
          message: "在庫数は0以上の整数で入力してください。",
        },
        { status: 400 }
      );
    }

    if (!janCode && !generateSystemBarcode) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_BARCODE_REQUIRED_400",
          message:
            "既存JANコードを入力するか、システムバーコードを発行してください。",
        },
        { status: 400 }
      );
    }

    if (storageLocationId) {
      const location = await prisma.storageLocation.findUnique({
        where: {
          id: storageLocationId,
        },
        select: {
          id: true,
        },
      });

      if (!location) {
        return NextResponse.json(
          {
            code: "ITEM_REGISTER_LOCATION_404",
            message: "指定した保管場所が見つかりません。",
          },
          { status: 404 }
        );
      }
    }

    const managementCode = getOptionalText(
      body.managementCode,
      100
    );

    if (janCode) {
      const duplicateJan = await prisma.item.findFirst({
        where: {
          janCode,
        },
        select: {
          id: true,
        },
      });

      if (duplicateJan) {
        return NextResponse.json(
          {
            code: "ITEM_REGISTER_JAN_DUPLICATE_409",
            message:
              "このJANコードはすでに登録されています。在庫追加は既存の商品から行ってください。",
          },
          { status: 409 }
        );
      }
    }

    if (managementCode) {
      const duplicateManagementCode =
        await prisma.item.findUnique({
          where: {
            managementCode,
          },
          select: {
            id: true,
          },
        });

      if (duplicateManagementCode) {
        return NextResponse.json(
          {
            code: "ITEM_REGISTER_MANAGEMENT_CODE_DUPLICATE_409",
            message: "この管理コードはすでに登録されています。",
          },
          { status: 409 }
        );
      }
    }

    const systemBarcode = generateSystemBarcode
      ? await createSystemBarcode()
      : null;

    const result = await prisma.$transaction(
      async (transaction) => {
        const item = await transaction.item.create({
          data: {
            name,
            janCode,
            systemBarcode,
            managementCode,
            managementGroupCode: getOptionalText(
              body.managementGroupCode,
              100
            ),
            manufacturer: getOptionalText(
              body.manufacturer,
              200
            ),
            majorCategory: getOptionalText(
              body.majorCategory,
              100
            ),
            minorCategory: getOptionalText(
              body.minorCategory,
              100
            ),
            defaultUnit: getOptionalText(body.unit, 30),
          },
        });

        const inventory =
          await transaction.inventoryInstance.create({
            data: {
              itemId: item.id,
              storageLocationId,
              managementCode: item.managementCode,
              managementGroupCode:
                item.managementGroupCode,
              manufacturer: item.manufacturer,
              majorCategory: item.majorCategory,
              minorCategory: item.minorCategory,
              lotNo: getOptionalText(body.lotNo, 100),
              expirationDate: getOptionalText(
                body.expirationDate,
                30
              ),
              unit: getOptionalText(body.unit, 30),
              quantity,
              actualQuantity: quantity,
              allocationType: "home",
              status: "在庫中",
              stocktakeStatus: "未棚卸",
            },
            include: {
              item: true,
              storageLocation: true,
            },
          });

        await transaction.inventoryHistory.create({
          data: {
            inventoryInstanceId: inventory.id,
            changeQuantity: quantity,
            action: "管理者による商品・在庫登録",
          },
        });

        return {
          item,
          inventory,
        };
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      }
    );

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "ITEM_REGISTER",
      route: "/api/items/register",
      detail: {
        itemId: result.item.id,
        inventoryInstanceId: result.inventory.id,
        itemName: result.item.name,
        janCode: result.item.janCode ?? "",
        systemBarcode: result.item.systemBarcode ?? "",
        quantity: result.inventory.quantity,
        generatedSystemBarcode: generateSystemBarcode,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: generateSystemBarcode
          ? "商品を登録し、システムバーコードを発行しました。"
          : "商品を登録しました。",
        ...result,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/items/register", error);

    const code =
      error instanceof Error &&
      error.message === "SYSTEM_BARCODE_GENERATE_FAILED"
        ? "ITEM_REGISTER_SYSTEM_BARCODE_500"
        : "ITEM_REGISTER_500";

    return NextResponse.json(
      {
        code,
        message:
          code === "ITEM_REGISTER_SYSTEM_BARCODE_500"
            ? "システムバーコードを発行できませんでした。もう一度お試しください。"
            : "商品登録に失敗しました。",
      },
      { status: 500 }
    );
  }
}