import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getLoggedInUser, isAdmin } from "@/lib/auth";
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
  // 「20」始まりはシステム内で発行する管理用コードとして使う。
  const serial = randomInt(0, 10_000_000_000)
    .toString()
    .padStart(10, "0");

  const base12 = `20${serial}`;

  return `${base12}${calculateCheckDigit(base12)}`;
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getLoggedInUser(request);

    if (!currentUser) {
      return NextResponse.json(
        {
          code: "AUTH_REQUIRED",
          message: "ログインが必要です。",
        },
        {
          status: 401,
        }
      );
    }

    if (!isAdmin(currentUser)) {
      return NextResponse.json(
        {
          code: "SYSTEM_JAN_ADMIN_ONLY",
          message: "システムJANの発行は管理者のみ実行できます。",
        },
        {
          status: 403,
        }
      );
    }

    const body: unknown = await request.json();

    const itemId =
      typeof body === "object" &&
      body !== null &&
      "itemId" in body &&
      typeof body.itemId === "string"
        ? body.itemId
        : "";

    if (!itemId) {
      return NextResponse.json(
        {
          code: "SYSTEM_JAN_ITEM_ID_REQUIRED",
          message: "商品IDが指定されていません。",
        },
        {
          status: 400,
        }
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
          code: "SYSTEM_JAN_ITEM_NOT_FOUND",
          message: "商品が見つかりません。",
        },
        {
          status: 404,
        }
      );
    }

    // 正式なJANがある商品は、それをそのまま利用する。
    if (item.janCode) {
      return NextResponse.json(
        {
          code: "SYSTEM_JAN_REAL_JAN_EXISTS",
          message: "この商品には既存のJANコードがあります。",
          item,
        },
        {
          status: 409,
        }
      );
    }

    // すでに発行済みなら同じシステムJANを返す。
    if (item.systemBarcode) {
      return NextResponse.json({
        success: true,
        created: false,
        item,
      });
    }

    // 重複時だけ再生成する。
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
        code: "SYSTEM_JAN_GENERATION_FAILED",
        message: "システムJANを発行できませんでした。もう一度試してください。",
      },
      {
        status: 500,
      }
    );
  } catch (error) {
    console.error("SYSTEM_JAN_500", error);

    return NextResponse.json(
      {
        code: "SYSTEM_JAN_500",
        message: "システムJANの発行中にエラーが発生しました。",
      },
      {
        status: 500,
      }
    );
  }
}