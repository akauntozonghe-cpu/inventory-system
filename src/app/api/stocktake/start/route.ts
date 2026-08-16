import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser } from "@/lib/auth";

type ScopeType =
  | "ALL"
  | "LOCATION"
  | "MAJOR_CATEGORY"
  | "MINOR_CATEGORY";

function isScopeType(value: unknown): value is ScopeType {
  return (
    value === "ALL" ||
    value === "LOCATION" ||
    value === "MAJOR_CATEGORY" ||
    value === "MINOR_CATEGORY"
  );
}

function scopeLabel(
  scopeType: ScopeType,
  scopeValue: string | null
) {
  if (scopeType === "ALL") {
    return "全在庫";
  }

  return scopeValue || "未指定";
}

export async function POST(request: NextRequest) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "STOCKTAKE_START_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as {
      title?: string;
      operator?: string;
      memo?: string;
      scopeType?: ScopeType;
      scopeValue?: string;
    };

    const title = body.title?.trim() ?? "";

    if (!title) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_START_TITLE_REQUIRED",
          message: "棚卸名を入力してください。",
        },
        { status: 400 }
      );
    }

    const operator =
      body.operator?.trim() || user.displayName;

    const memo =
      body.memo?.trim() || null;

    const selectedScopeType: ScopeType =
      isScopeType(body.scopeType)
        ? body.scopeType
        : "ALL";

    const selectedScopeValue =
      selectedScopeType === "ALL"
        ? null
        : body.scopeValue?.trim() || null;

    if (
      selectedScopeType !== "ALL" &&
      !selectedScopeValue
    ) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_START_SCOPE_VALUE_REQUIRED",
          message: "部分棚卸の対象を選択してください。",
        },
        { status: 400 }
      );
    }

    /**
     * ここが変更点
     *
     * 以前は
     * IN_PROGRESS があると409を返していた。
     *
     * 今後は何件あっても新規作成可能。
     */

    const inventoryWhere: Prisma.InventoryInstanceWhereInput = {};

    if (
      selectedScopeType === "LOCATION" &&
      selectedScopeValue
    ) {
      inventoryWhere.storageLocation = {
        is: {
          name: selectedScopeValue,
        },
      };
    }

    if (
      selectedScopeType === "MAJOR_CATEGORY" &&
      selectedScopeValue
    ) {
      inventoryWhere.OR = [
        {
          majorCategory: selectedScopeValue,
        },
        {
          item: {
            is: {
              majorCategory: selectedScopeValue,
            },
          },
        },
      ];
    }

    if (
      selectedScopeType === "MINOR_CATEGORY" &&
      selectedScopeValue
    ) {
      inventoryWhere.OR = [
        {
          minorCategory: selectedScopeValue,
        },
        {
          item: {
            is: {
              minorCategory: selectedScopeValue,
            },
          },
        },
      ];
    }

    const inventories =
      await prisma.inventoryInstance.findMany({
        where: inventoryWhere,
        select: {
          id: true,
          quantity: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

    if (inventories.length === 0) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_START_TARGET_EMPTY",
          message:
            "選択した範囲に棚卸対象がありません。",
        },
        { status: 400 }
      );
    }

    const session =
      await prisma.stocktakeSession.create({
        data: {
          title,
          operator,
          operatorUserId: user.id,
          memo,
          scopeType: selectedScopeType,
          scopeValue: selectedScopeValue,
          scopeLabel: scopeLabel(
            selectedScopeType,
            selectedScopeValue
          ),
          status: "IN_PROGRESS",

          targets: {
            create: inventories.map((inventory) => ({
              inventoryInstanceId:
                inventory.id,
              expectedQuantity:
                inventory.quantity,
            })),
          },
        },

        include: {
          _count: {
            select: {
              targets: true,
            },
          },
        },
      });

    return NextResponse.json(
      {
        success: true,
        session,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        code: "STOCKTAKE_START_FAILED",
        message:
          "棚卸を開始できませんでした。",
      },
      {
        status: 500,
      }
    );
  }
}