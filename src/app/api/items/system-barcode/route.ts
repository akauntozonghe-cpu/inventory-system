import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function createCheckDigit(body: string) {
  let total = 0;

  for (let index = 0; index < body.length; index += 1) {
    const digit = Number(body[index]);

    total += digit * (index % 2 === 0 ? 1 : 3);
  }

  return String((10 - (total % 10)) % 10);
}

function createSystemBarcode() {
  // 04 + 10桁のランダム番号 + EAN-13チェック桁
  const serial = String(
    randomInt(0, 10_000_000_000)
  ).padStart(10, "0");

  const body = `04${serial}`;

  return `${body}${createCheckDigit(body)}`;
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    const itemId =
      typeof body === "object" &&
      body !== null &&
      "itemId" in body &&
      typeof body.itemId === "string"
        ? body.itemId.trim()
        : "";

    if (!itemId) {
      return NextResponse.json(
        { message: "商品IDが指定されていません。" },
        { status: 400 }
      );
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        name: true,
        janCode: true,
        systemBarcode: true,
      },
    });

    if (!item) {
      return NextResponse.json(
        { message: "商品が見つかりません。" },
        { status: 404 }
      );
    }

    if (item.systemBarcode) {
      return NextResponse.json({
        item,
        created: false,
      });
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const systemBarcode = createSystemBarcode();

      try {
        const updatedItem = await prisma.item.update({
          where: { id: item.id },
          data: { systemBarcode },
          select: {
            id: true,
            name: true,
            janCode: true,
            systemBarcode: true,
          },
        });

        return NextResponse.json({
          item: updatedItem,
          created: true,
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
        message:
          "システムバーコードを発番できませんでした。もう一度試してください。",
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("POST /api/items/system-barcode", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "システムバーコードの発番に失敗しました。",
      },
      { status: 500 }
    );
  }
}