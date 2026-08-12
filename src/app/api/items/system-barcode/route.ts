import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createAdminActionLog } from "@/lib/error-report";

function calculateCheckDigit(base12: string) {
  const total = base12
    .split("")
    .reverse()
    .reduce((sum, digit, index) => {
      const value = Number(digit);

      return sum + value * (index % 2 === 0 ? 3 : 1);
    }, 0);

  return String((10 - (total % 10)) % 10);
}

function createSystemBarcode() {
  const serial = randomInt(0, 10_000_000_000)
    .toString()
    .padStart(10, "0");

  const base12 = `20${serial}`;

  return `${base12}${calculateCheckDigit(base12)}`;
}

function getItemId(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "itemId" in body &&
    typeof body.itemId === "string"
  ) {
    return body.itemId.trim();
  }

  return "";
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
        success: false,
        code: "ADMIN_REQUIRED",
        message: "システムバーコードの発行には管理者権限が必要です。",
      },
      { status: 403 }
    );
  }

  try {
    const body: unknown = await request.json();
    const itemId = getItemId(body);

    if (!itemId) {
      return NextResponse.json(
        {
          success: false,
          code: "SYSTEM_BARCODE_ITEM_ID_REQUIRED",
          message: "商品IDが指定されていません。",
        },
        { status: 400 }
      );
    }

    const item = await prisma.item.findUnique({
      where: {
        id: itemId,
      },
    });

    if (!item) {
      return NextResponse.json(
        {
          success: false,
          code: "SYSTEM_BARCODE_ITEM_NOT_FOUND",
          message: "商品が見つかりません。",
        },
        { status: 404 }
      );
    }

    if (item.janCode) {
      return NextResponse.json(
        {
          success: false,
          code: "SYSTEM_BARCODE_REAL_JAN_EXISTS",
          message:
            "この商品には既存JANコードが登録されています。システムバーコードは発行できません。",
          item,
        },
        { status: 409 }
      );
    }

    if (item.systemBarcode) {
      return NextResponse.json({
        success: true,
        created: false,
        message:
          "この商品にはシステムバーコードがすでに発行されています。",
        item,
      });
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const systemBarcode = createSystemBarcode();

      try {
        const updatedItem = await prisma.item.update({
          where: {
            id: item.id,
          },
          data: {
            systemBarcode,
          },
        });

        await createAdminActionLog({
          adminUserId: adminUser.id,
          action: "ITEM_SYSTEM_BARCODE_GENERATE",
          route: "/api/items/system-barcode",
          detail: {
            itemId: updatedItem.id,
            itemName: updatedItem.name,
            systemBarcode: updatedItem.systemBarcode ?? "",
          },
        });

        return NextResponse.json({
          success: true,
          created: true,
          message: "システムバーコードを発行しました。",
          item: updatedItem,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }

        throw error;
      }
    }

    return NextResponse.json(
      {
        success: false,
        code: "SYSTEM_BARCODE_GENERATION_FAILED",
        message:
          "システムバーコードを発行できませんでした。時間をおいてもう一度お試しください。",
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("POST /api/items/system-barcode", error);

    return NextResponse.json(
      {
        success: false,
        code: "SYSTEM_BARCODE_500",
        message:
          "システムバーコードの発行中にエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}