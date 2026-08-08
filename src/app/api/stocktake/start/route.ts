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
      {
        code: "AUTH_REQUIRED",
        message: "ログインが必要です。",
      },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    const title =
      typeof body.title === "string" ? body.title.trim() : "";

    // 画面で変更可能な担当者名
    const operator =
      typeof body.operator === "string" ? body.operator.trim() : "";

    const memo =
      typeof body.memo === "string" ? body.memo.trim() : "";

    const scopeType: ScopeType = validScopes.includes(
      body.scopeType as ScopeType
    )
      ? body.scopeType
      : "ALL";

    const scopeValue =
      typeof body.scopeValue === "string" ? body.scopeValue.trim() : "";

    const scopeLabel =
      typeof body.scopeLabel === "string" ? body.scopeLabel.trim() : "";

    if (!title) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_TITLE_REQUIRED",
          message: "棚卸名を入力してください。",
        },
        { status: 400 }
      );
    }

    if (scopeType !== "ALL" && !scopeValue) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_SCOPE_REQUIRED",
          message: "棚卸範囲を選択してください。",
        },
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

    const inventories = await prisma.inventoryInstance.findMany({
      where,
      select: {
        id: true,
        quantity: true,
      },
    });

    if (inventories.length === 0) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_TARGET_EMPTY",
          message: "選択した棚卸範囲に在庫がありません。",
        },
        { status: 400 }
      );
    }

    // Neonの接続上限に配慮し、長い対話型トランザクションは使わない
    const session = await prisma.stocktakeSession.create({
      data: {
        title,

        // 入力欄の担当者名。空欄ならログイン名
        operator: operator || user.displayName,

        // 実際に操作したログインユーザー
        operatorUserId: user.id,

        memo: memo || null,

        location:
          scopeType === "LOCATION" ? scopeLabel || null : null,

        scopeType,

        scopeValue: scopeType === "ALL" ? null : scopeValue,

        scopeLabel:
          scopeType === "ALL" ? "全在庫" : scopeLabel || null,
      },
    });

    try {
      await prisma.stocktakeTarget.createMany({
        data: inventories.map((inventory) => ({
          sessionId: session.id,
          inventoryInstanceId: inventory.id,
          expectedQuantity: inventory.quantity,
        })),
      });
    } catch (targetError) {
      // 対象作成に失敗した中途半端な棚卸は残さない
      await prisma.stocktakeSession
        .delete({ where: { id: session.id } })
        .catch(() => undefined);

      throw targetError;
    }

    return NextResponse.json(
      {
        ...session,
        targetCount: inventories.length,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        code: "STOCKTAKE_START_FAILED",
        message: "棚卸を開始できませんでした。",
      },
      { status: 500 }
    );
  }
}