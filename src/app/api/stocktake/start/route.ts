import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ScopeType =
  | "ALL"
  | "LOCATION"
  | "MAJOR_CATEGORY"
  | "MINOR_CATEGORY";

const validScopeTypes: ScopeType[] = [
  "ALL",
  "LOCATION",
  "MAJOR_CATEGORY",
  "MINOR_CATEGORY",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const title =
      typeof body.title === "string" ? body.title.trim() : "";

    const operator =
      typeof body.operator === "string" ? body.operator.trim() : "";

    const memo =
      typeof body.memo === "string" ? body.memo.trim() : "";

    const scopeType: ScopeType = validScopeTypes.includes(body.scopeType)
      ? body.scopeType
      : "ALL";

    const scopeValue =
      typeof body.scopeValue === "string" ? body.scopeValue.trim() : "";

    const scopeLabel =
      typeof body.scopeLabel === "string" ? body.scopeLabel.trim() : "";

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

    const result = await prisma.$transaction(async (tx) => {
      const inventories = await tx.inventoryInstance.findMany({
        where: inventoryWhere,
        select: {
          id: true,
          quantity: true,
        },
      });

      if (inventories.length === 0) {
        throw new Error("選択した範囲に在庫がありません");
      }

      const session = await tx.stocktakeSession.create({
        data: {
          title,
          operator: operator || "管理者",
          memo: memo || null,
          location:
            scopeType === "LOCATION" ? scopeLabel || null : null,
          scopeType,
          scopeValue: scopeType === "ALL" ? null : scopeValue,
          scopeLabel: scopeType === "ALL" ? "全在庫" : scopeLabel,
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

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "棚卸の開始に失敗しました",
      },
      { status: 400 }
    );
  }
}