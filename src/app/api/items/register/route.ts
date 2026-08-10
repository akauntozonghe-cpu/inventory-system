import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getLoggedInUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function getText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalText(value: unknown) {
  const text = getText(value);
  return text === "" ? null : text;
}

function createCheckDigit(body: string) {
  let total = 0;

  for (let index = 0; index < body.length; index += 1) {
    total += Number(body[index]) * (index % 2 === 0 ? 1 : 3);
  }

  return String((10 - (total % 10)) % 10);
}

async function createSystemJan() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const serial = String(randomInt(0, 10_000_000_000)).padStart(10, "0");
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

  throw new Error("SYSTEM_JAN_GENERATE_FAILED");
}

export async function POST(request: NextRequest) {
  try {
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

    const name = getText(body.name);
    const janCode = getOptionalText(body.janCode);
    const quantity = Number(body.quantity ?? 0);
    const storageLocationId = getOptionalText(body.storageLocationId);
    const generateSystemJan = body.generateSystemJan === true;

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

    if (!janCode && !generateSystemJan) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_JAN_REQUIRED_400",
          message:
            "JANコードがない商品は、管理者がシステムJANを発行して登録してください。",
        },
        { status: 400 }
      );
    }

    if (generateSystemJan && !isAdmin(currentUser)) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_SYSTEM_JAN_ADMIN_403",
          message: "システムJANの発行は管理者のみ実行できます。",
        },
        { status: 403 }
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

    const managementCode = getOptionalText(body.managementCode);

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
      const duplicateManagementCode = await prisma.item.findUnique({
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

    const systemBarcode = generateSystemJan ? await createSystemJan() : null;

    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.item.create({
        data: {
          name,
          janCode,
          systemBarcode,
          managementCode,
          managementGroupCode: getOptionalText(body.managementGroupCode),
          manufacturer: getOptionalText(body.manufacturer),
          majorCategory: getOptionalText(body.majorCategory),
          minorCategory: getOptionalText(body.minorCategory),
          defaultUnit: getOptionalText(body.unit),
        },
      });

      const inventory = await tx.inventoryInstance.create({
        data: {
          itemId: item.id,
          storageLocationId,
          managementCode,
          managementGroupCode: getOptionalText(body.managementGroupCode),
          manufacturer: getOptionalText(body.manufacturer),
          majorCategory: getOptionalText(body.majorCategory),
          minorCategory: getOptionalText(body.minorCategory),
          lotNo: getOptionalText(body.lotNo),
          expirationDate: getOptionalText(body.expirationDate),
          unit: getOptionalText(body.unit),
          quantity,
          actualQuantity: quantity,
          allocationType: "home",
          status: "IN_STOCK",
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
          action: "ITEM_REGISTER",
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
        message: generateSystemJan
          ? "商品を登録し、システムJANを発行しました。"
          : "商品を登録しました。",
        ...result,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ITEM_REGISTER_ERROR", error);

    const code =
      error instanceof Error && error.message === "SYSTEM_JAN_GENERATE_FAILED"
        ? "ITEM_REGISTER_SYSTEM_JAN_500"
        : "ITEM_REGISTER_500";

    return NextResponse.json(
      {
        code,
        message:
          code === "ITEM_REGISTER_SYSTEM_JAN_500"
            ? "システムJANを発行できませんでした。もう一度お試しください。"
            : "商品登録に失敗しました。",
      },
      { status: 500 }
    );
  }
}