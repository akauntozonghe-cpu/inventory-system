import { NextRequest, NextResponse } from "next/server";
import { Prisma, StocktakeStatus } from "@prisma/client";
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

function getText(value: unknown, maxLength = 300) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function getStatusLabel(status: StocktakeStatus) {
  switch (status) {
    case "IN_PROGRESS":
      return "作業中";
    case "PAUSED":
      return "中断中";
    case "REVIEW":
      return "確認待ち";
    case "CONFLICT":
      return "安全確認中";
    case "COMPLETED":
      return "完了";
    case "CANCELLED":
      return "取消済み";
  }
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
    const body = (await request.json()) as Record<string, unknown>;

    const title = getText(body.title, 200);
    const operator = getText(body.operator, 100);
    const memo = getText(body.memo, 1000);

    const scopeType: ScopeType = validScopes.includes(
      body.scopeType as ScopeType
    )
      ? (body.scopeType as ScopeType)
      : "ALL";

    const scopeValue = getText(body.scopeValue, 200);
    const scopeLabel = getText(body.scopeLabel, 200);

    if (!title) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_TITLE_REQUIRED",
          message: "棚卸名を入力してください。",
        },
        { status: 400 }
      );
    }

    if (!operator) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_OPERATOR_REQUIRED",
          message: "担当者名を入力してください。",
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

    const activeStatuses: StocktakeStatus[] = [
      "IN_PROGRESS",
      "PAUSED",
      "REVIEW",
      "CONFLICT",
    ];

    const activeSession = await prisma.stocktakeSession.findFirst({
      where: {
        operatorUserId: user.id,
        status: {
          in: activeStatuses,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (activeSession) {
      const statusLabel = getStatusLabel(activeSession.status);

      return NextResponse.json(
        {
          code: "STOCKTAKE_ACTIVE_SESSION_EXISTS",
          message: `「${activeSession.title}」が${statusLabel}です。新しい棚卸を始める前に、既存の棚卸を再開・終了・安全確認してください。`,
          session: activeSession,
        },
        { status: 409 }
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
          message: "選択した棚卸範囲に対象在庫がありません。",
        },
        { status: 400 }
      );
    }

    const session = await prisma.$transaction(
      async (transaction) => {
        const latestActiveSession =
          await transaction.stocktakeSession.findFirst({
            where: {
              operatorUserId: user.id,
              status: {
                in: activeStatuses,
              },
            },
            select: {
              id: true,
            },
          });

        if (latestActiveSession) {
          throw new Error("STOCKTAKE_ACTIVE_SESSION_RACE");
        }

        const createdSession = await transaction.stocktakeSession.create({
          data: {
            title,
            operator,
            operatorUserId: user.id,
            memo: memo || null,
            location: scopeType === "LOCATION" ? scopeLabel || null : null,
            scopeType,
            scopeValue: scopeType === "ALL" ? null : scopeValue,
            scopeLabel:
              scopeType === "ALL"
                ? "全在庫"
                : scopeLabel || null,
          },
        });

        await transaction.stocktakeTarget.createMany({
          data: inventories.map((inventory) => ({
            sessionId: createdSession.id,
            inventoryInstanceId: inventory.id,
            expectedQuantity: inventory.quantity,
          })),
        });

        return createdSession;
      },
      {
        maxWait: 15_000,
        timeout: 60_000,
      }
    );

    return NextResponse.json(
      {
        success: true,
        session: {
          ...session,
          targetCount: inventories.length,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/stocktake/start", error);

    const code =
      error instanceof Error
        ? error.message
        : "STOCKTAKE_START_500";

    if (code === "STOCKTAKE_ACTIVE_SESSION_RACE") {
      return NextResponse.json(
        {
          code,
          message:
            "別の操作で棚卸が開始されました。画面を更新して既存の棚卸を確認してください。",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        code: "STOCKTAKE_START_500",
        message: "棚卸を開始できませんでした。",
      },
      { status: 500 }
    );
  }
}