import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const scopeTypes = [
  "ALL",
  "LOCATION",
  "MAJOR_CATEGORY",
  "MINOR_CATEGORY",
] as const;

type ScopeType = (typeof scopeTypes)[number];

export async function POST(request: NextRequest) {
  let createdSessionId: string | null = null;

  try {
    const body = await request.json();

    const title =
      typeof body.title === "string" ? body.title.trim() : "";

    const operator =
      typeof body.operator === "string" ? body.operator.trim() : "";

    const memo =
      typeof body.memo === "string" ? body.memo.trim() : "";

    const scopeType: ScopeType = scopeTypes.includes(body.scopeType)
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
        { message: "棚卸名を入力してください" },
        { status: 400 }
      );
    }

    if (scopeType !== "ALL" && !scopeValue) {
      return NextResponse.json(
        { message: "棚卸対象を選択してください" },
        { status: 400 }
      );
    }

    const inventoryWhere: Prisma.InventoryInstanceWhereInput = {};

    if (scopeType === "LOCATION") {
      inventoryWhere.storageLocationId = scopeValue;
    }

    if (scopeType === "MAJOR_CATEGORY") {
      inventoryWhere.item = {
        majorCategory: scopeValue,
      };
    }

    if (scopeType === "MINOR_CATEGORY") {
      inventoryWhere.item = {
        minorCategory: scopeValue,
      };
    }

    // 先に対象在庫を取得する。長いトランザクションにはしない。
    const inventories = await prisma.inventoryInstance.findMany({
      where: inventoryWhere,
      select: {
        id: true,
        quantity: true,
      },
    });

    if (inventories.length === 0) {
      return NextResponse.json(
        { message: "選択した対象に在庫がありません" },
        { status: 400 }
      );
    }

    // 棚卸セッションを作成
    const session = await prisma.stocktakeSession.create({
      data: {
        title,
        operator: operator || "管理者",
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

    createdSessionId = session.id;

    // 対象在庫のスナップショットを一括登録
    await prisma.stocktakeTarget.createMany({
      data: inventories.map((inventory) => ({
        sessionId: session.id,
        inventoryInstanceId: inventory.id,
        expectedQuantity: inventory.quantity,
      })),
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error(error);

    // 対象登録に失敗した場合は、空の棚卸を残さない
    if (createdSessionId) {
      try {
        await prisma.stocktakeSession.delete({
          where: { id: createdSessionId },
        });
      } catch (cleanupError) {
        console.error("棚卸セッションの後始末に失敗しました", cleanupError);
      }
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? `棚卸を開始できませんでした: ${error.message}`
            : "棚卸を開始できませんでした",
      },
      { status: 500 }
    );
  }
}