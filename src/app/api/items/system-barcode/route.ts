import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  getLoggedInUser,
  hasAdminAccess,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

function createSystemJan() {
  // GS1の正式JANとは区別する、システム内専用の13桁コード。
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
  try {
    const currentUser = getLoggedInUser(request);

    if (!currentUser) {
      return NextResponse.json(
        {
          success: false,
          code: "AUTH_REQUIRED",
          message: "ログイン情報を確認できませんでした。",
        },
        { status: 401 }
      );
    }

    if (!hasAdminAccess(request)) {
      return NextResponse.json(
        {
          success: false,
          code: "SYSTEM_JAN_ADMIN_REQUIRED",
          message:
            "システムJANの発行には管理者認証が必要です。棚卸画面の管理者モードを有効にしてください。",
        },
        { status: 403 }
      );
    }

    const body: unknown = await request.json();
    const itemId = getItemId(body);

    if (!itemId) {
      return NextResponse.json(
        {
          success: false,
          code: "SYSTEM_JAN_ITEM_ID_REQUIRED",
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
          code: "SYSTEM_JAN_ITEM_NOT_FOUND",
          message: "商品が見つかりません。",
        },
        { status: 404 }
      );
    }

    // 正式なJANが登録済みの商品には、システムJANを重複発行しない。
    if (item.janCode) {
      return NextResponse.json(
        {
          success: false,
          code: "SYSTEM_JAN_REAL_JAN_EXISTS",
          message: "この商品には既存のJANコードが登録されています。",
          item,
        },
        { status: 409 }
      );
    }

    // 発行済みなら同じコードを返す。
    if (item.systemBarcode) {
      return NextResponse.json({
        success: true,
        created: false,
        item,
      });
    }

    // 一意制約の衝突時だけ再試行する。
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const systemBarcode = createSystemJan();

      try {
        const updatedItem = await prisma.item.update({
          where: {
            id: item.id,
          },
          data: {
            systemBarcode,
          },
        });

        return NextResponse.json({
          success: true,
          created: true,
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
        code: "SYSTEM_JAN_GENERATION_FAILED",
        message:
          "システムJANを発行できませんでした。時間をおいてもう一度試してください。",
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("SYSTEM_JAN_500", error);

    return NextResponse.json(
      {
        success: false,
        code: "SYSTEM_JAN_500",
        message: "システムJANの発行中にエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}