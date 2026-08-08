import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser } from "@/lib/auth";

type ScopeType =
  | "ALL"
  | "LOCATION"
  | "MAJOR_CATEGORY"
  | "MINOR_CATEGORY";

const validScopes: ScopeType[] = [
  "ALL",
  "LOCATION",
  "MAJOR_CATEGORY",
  "MINOR_CATEGORY",
];

export async function POST(request: NextRequest) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      { message: "ログインが必要です。" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    const title =
      typeof body.title === "string" ? body.title.trim() : "";

    // 画面で入力できる担当者名
    const operator =
      typeof body.operator === "string"
        ? body.operator.trim()
        : "";

    const memo =
      typeof body.memo === "string" ? body.memo.trim() : "";

    const scopeType: ScopeType = validScopes.includes(body.scopeType)
      ? body.scopeType
      : "ALL";

    const scopeValue =
      typeof body.scopeValue === "string"
        ? body.scopeValue.trim()
        : "";

    const scopeLabel =
      typeof body.scopeLabel === "string"
        ? body.scopeLabel.trim()
        : "";

    if (!title) {
      return NextResponse.json(
        { message: "棚卸名を入力してください。" },
        { status: 400 }
      );
    }

    if (scopeType !== "ALL" && !scopeValue) {
      return NextResponse.json(
        { message: "棚卸範囲を選択してください。" },
        { status: 400 }
      );
    }

    const where: Prisma.InventoryInstanceWhereInput = {};

    if (scopeType === "LOCATION") {
      where.storageLocationId = scopeValue;
    }

    if (scopeType === "MAJOR_CATEGORY") {
      where.item = {
        majorCategory: scopeValue,
      };
    }

    if (scopeType === "MINOR_CATEGORY") {
      where.item = {
        minorCategory: scopeValue,
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const inventories = await tx.inventoryInstance.findMany({
        where,
        select: {
          id: true,
          quantity: true,
        },
      });

      if (inventories.length === 0) {
        throw new Error(
          "選択した棚卸範囲に在庫がありません。"
        );
      }

      const session = await tx.stocktakeSession.create({
        data: {
          title,

          // 担当者名：入力された名前、未入力ならログイン名
          operator: operator || user.displayName,

          // 実施者：ログインしたユーザーを必ず記録
          operatorUserId: user.id,

          memo: memo || null,

          location:
            scopeType === "LOCATION"
              ? scopeLabel || null
              : null,

          scopeType,

          scopeValue:
            scopeType === "ALL"
              ? null
              : scopeValue,

          scopeLabel:
            scopeType === "ALL"
              ? "全在庫"
              : scopeLabel,
        },
      });

      await tx.stocktakeTarget.createMany({
        data: inventories.map((inventory) => ({
          sessionId: session.id,
          inventoryInstanceId: inventory.id,
          expectedQuantity: inventory.quantity,
        })),
      });

      return {
        ...session,
        targetCount: inventories.length,
      };
    });

    return NextResponse.json(result, {
      status: 201,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "棚卸を開始できませんでした。",
      },
      { status: 400 }
    );
  }
}