import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser, hasAdminAccess } from "@/lib/auth";

type RecordBody = {
  sessionId?: unknown;
  inventoryInstanceId?: unknown;
  countedQuantity?: unknown;
  memo?: unknown;
};

function getText(value: unknown, maxLength = 1000) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

export async function POST(request: NextRequest) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "STOCKTAKE_RECORD_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as RecordBody;

    const sessionId = getText(body.sessionId, 100);
    const inventoryInstanceId = getText(body.inventoryInstanceId, 100);
    const countedQuantity = Number(body.countedQuantity);
    const memo = getText(body.memo, 1000) || null;

    if (!sessionId || !inventoryInstanceId) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_RECORD_INPUT_400",
          message: "棚卸セッションまたは対象在庫が指定されていません。",
        },
        { status: 400 }
      );
    }

    if (!Number.isInteger(countedQuantity) || countedQuantity < 0) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_RECORD_QUANTITY_400",
          message: "棚卸数量は0以上の整数で入力してください。",
        },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(
      async (transaction) => {
        const session = await transaction.stocktakeSession.findUnique({
          where: {
            id: sessionId,
          },
          select: {
            id: true,
            status: true,
            operatorUserId: true,
          },
        });

        if (!session) {
          throw new Error("STOCKTAKE_SESSION_NOT_FOUND");
        }

        const isOperator =
          session.operatorUserId === null ||
          session.operatorUserId === user.id;

        if (!isOperator && !hasAdminAccess(request)) {
          throw new Error("STOCKTAKE_OPERATOR_FORBIDDEN");
        }

        if (session.status === "CONFLICT") {
          throw new Error("STOCKTAKE_CONFLICT_LOCKED");
        }

        if (session.status !== "IN_PROGRESS") {
          throw new Error("STOCKTAKE_NOT_IN_PROGRESS");
        }

        const target = await transaction.stocktakeTarget.findUnique({
          where: {
            sessionId_inventoryInstanceId: {
              sessionId,
              inventoryInstanceId,
            },
          },
          select: {
            expectedQuantity: true,
          },
        });

        if (!target) {
          throw new Error("STOCKTAKE_TARGET_NOT_FOUND");
        }

        const record = await transaction.stocktakeRecord.upsert({
          where: {
            sessionId_inventoryInstanceId: {
              sessionId,
              inventoryInstanceId,
            },
          },
          update: {
            countedQuantity,
            memo,
          },
          create: {
            sessionId,
            inventoryInstanceId,
            countedQuantity,
            memo,
          },
          select: {
            id: true,
            sessionId: true,
            inventoryInstanceId: true,
            countedQuantity: true,
            memo: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        return {
          record,
          expectedQuantity: target.expectedQuantity,
          difference: countedQuantity - target.expectedQuantity,
        };
      },
      {
        maxWait: 10_000,
        timeout: 20_000,
      }
    );

    return NextResponse.json({
      success: true,
      code: "STOCKTAKE_RECORD_SAVED",
      message: "棚卸入力を保存しました。",
      record: result.record,
      expectedQuantity: result.expectedQuantity,
      difference: result.difference,
    });
  } catch (error) {
    console.error("POST /api/stocktake/record", error);

    const code =
      error instanceof Error ? error.message : "STOCKTAKE_RECORD_500";

    const messages: Record<string, string> = {
      STOCKTAKE_SESSION_NOT_FOUND:
        "棚卸セッションが見つかりません。",
      STOCKTAKE_OPERATOR_FORBIDDEN:
        "この棚卸を入力する権限がありません。",
      STOCKTAKE_NOT_IN_PROGRESS:
        "作業中ではない棚卸には入力できません。",
      STOCKTAKE_CONFLICT_LOCKED:
        "在庫データの競合が検出されたため、この棚卸は管理者確認まで停止しています。",
      STOCKTAKE_TARGET_NOT_FOUND:
        "この在庫は現在の棚卸対象に含まれていません。",
    };

    const status =
      code === "STOCKTAKE_OPERATOR_FORBIDDEN"
        ? 403
        : code === "STOCKTAKE_SESSION_NOT_FOUND"
          ? 404
          : code === "STOCKTAKE_CONFLICT_LOCKED"
            ? 409
            : 400;

    return NextResponse.json(
      {
        success: false,
        code,
        message: messages[code] ?? "棚卸入力の保存に失敗しました。",
      },
      { status }
    );
  }
}