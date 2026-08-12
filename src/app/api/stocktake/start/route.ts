import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser } from "@/lib/auth";

type ScopeType = "ALL" | "LOCATION" | "MAJOR_CATEGORY" | "MINOR_CATEGORY";

function isScopeType(value: unknown): value is ScopeType {
  return (
    value === "ALL" ||
    value === "LOCATION" ||
    value === "MAJOR_CATEGORY" ||
    value === "MINOR_CATEGORY"
  );
}

function scopeLabel(scopeType: ScopeType, scopeValue: string | null) {
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
    const body: unknown = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          code: "STOCKTAKE_START_BODY_INVALID",
          message: "棚卸開始情報が正しくありません。",
        },
        { status: 400 }
      );
    }

    const input = body as {
      title?: unknown;
      operator?: unknown;
      memo?: unknown;
      scopeType?: unknown;
      scopeValue?: unknown;
    };

    const title =
      typeof input.title === "string" ? input.title.trim() : "";

    const operator =
      typeof input.operator === "string" && input.operator.trim()
        ? input.operator.trim()
        : user.displayName;

    const memo =
      typeof input.memo === "string" && input.memo.trim()
        ? input.memo.trim()
        : null;

    const selectedScopeType: ScopeType = isScopeType(input.scopeType)
      ? input.scopeType
      : "ALL";

    const rawScopeValue =
      typeof input.scopeValue === "string" ? input.scopeValue.trim() : "";

    const selectedScopeValue =
      selectedScopeType === "ALL" ? null : rawScopeValue || null;

    if (!title) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_START_TITLE_REQUIRED",
          message: "棚卸名を入力してください。",
        },
        { status: 400 }
      );
    }

    if (selectedScopeType !== "ALL" && !selectedScopeValue) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_START_SCOPE_VALUE_REQUIRED",
          message: "部分棚卸の対象を選択してください。",
        },
        { status: 400 }
      );
    }

    const activeSession = await prisma.stocktakeSession.findFirst({
      where: {
        status: {
          in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"],
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
        operator: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (activeSession) {
      const statusText =
        activeSession.status === "IN_PROGRESS"
          ? "作業中"
          : activeSession.status === "PAUSED"
            ? "中断中"
            : activeSession.status === "REVIEW"
              ? "確認待ち"
              : "要確認";

      return NextResponse.json(
        {
          code: "STOCKTAKE_ACTIVE_SESSION_EXISTS",
          message: `「${activeSession.title}」が${statusText}です。先に再開・終了・正式確定を行ってください。`,
          activeSession,
        },
        { status: 409 }
      );
    }

    const inventoryWhere: Prisma.InventoryInstanceWhereInput = {};

    if (selectedScopeType === "LOCATION" && selectedScopeValue) {
      inventoryWhere.storageLocation = {
        is: {
          name: selectedScopeValue,
        },
      };
    }

    if (selectedScopeType === "MAJOR_CATEGORY" && selectedScopeValue) {
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

    if (selectedScopeType === "MINOR_CATEGORY" && selectedScopeValue) {
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

    const inventories = await prisma.inventoryInstance.findMany({
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
            "選択した範囲に棚卸対象がありません。対象範囲または登録済み在庫を確認してください。",
        },
        { status: 400 }
      );
    }

    const session = await prisma.stocktakeSession.create({
      data: {
        title,
        operator,
        operatorUserId: user.id,
        memo,
        scopeType: selectedScopeType,
        scopeValue: selectedScopeValue,
        scopeLabel: scopeLabel(selectedScopeType, selectedScopeValue),
        status: "IN_PROGRESS",
        targets: {
          create: inventories.map((inventory) => ({
            inventoryInstanceId: inventory.id,
            expectedQuantity: inventory.quantity,
          })),
        },
      },
      select: {
        id: true,
        title: true,
        operator: true,
        scopeType: true,
        scopeValue: true,
        scopeLabel: true,
        status: true,
        startedAt: true,
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
        code: "STOCKTAKE_STARTED",
        message: `「${session.title}」を開始しました。`,
        session: {
          id: session.id,
          title: session.title,
          operator: session.operator,
          scopeType: session.scopeType,
          scopeValue: session.scopeValue,
          scopeLabel: session.scopeLabel,
          status: session.status,
          startedAt: session.startedAt.toISOString(),
          targetCount: session._count.targets,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/stocktake/start", error);

    return NextResponse.json(
      {
        code: "STOCKTAKE_START_FAILED",
        message: "棚卸を開始できませんでした。時間をおいて再試行してください。",
      },
      { status: 500 }
    );
  }
}