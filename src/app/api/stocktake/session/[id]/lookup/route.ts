import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getLoggedInUser,
  hasAdminAccess,
} from "@/lib/auth";

function normalizeCode(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s-]/g, "")
    .toLowerCase();
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "STOCKTAKE_LOOKUP_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const { id: sessionId } = await context.params;
    const code =
      request.nextUrl.searchParams.get("code")?.trim() ?? "";

    if (!sessionId || !code) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_LOOKUP_REQUIRED",
          message:
            "棚卸セッションIDとバーコードを指定してください。",
        },
        { status: 400 }
      );
    }

    const session = await prisma.stocktakeSession.findUnique({
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
      return NextResponse.json(
        {
          code: "STOCKTAKE_LOOKUP_SESSION_404",
          message: "棚卸セッションが見つかりません。",
        },
        { status: 404 }
      );
    }

    const canOperate =
      session.operatorUserId === user.id ||
      hasAdminAccess(request);

    if (!canOperate) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_LOOKUP_FORBIDDEN",
          message: "この棚卸を操作する権限がありません。",
        },
        { status: 403 }
      );
    }

    if (session.status !== "IN_PROGRESS") {
      return NextResponse.json(
        {
          code: "STOCKTAKE_LOOKUP_NOT_IN_PROGRESS",
          message:
            "作業中ではない棚卸ではバーコード照合できません。",
        },
        { status: 409 }
      );
    }

    const normalizedCode = normalizeCode(code);

    const targets = await prisma.stocktakeTarget.findMany({
      where: {
        sessionId,
      },
      select: {
        expectedQuantity: true,
        inventoryInstance: {
          select: {
            id: true,
            managementCode: true,
            lotNo: true,
            expirationDate: true,
            unit: true,
            item: {
              select: {
                id: true,
                name: true,
                janCode: true,
                systemBarcode: true,
                managementCode: true,
                manufacturer: true,
                majorCategory: true,
                minorCategory: true,
              },
            },
            storageLocation: {
              select: {
                id: true,
                name: true,
              },
            },
            stocktakeRecords: {
              where: {
                sessionId,
              },
              select: {
                countedQuantity: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    /*
     * JAN・システムバーコード・管理番号は、
     * 記号や全角半角の差を吸収して照合する。
     * 同一JANで保管場所やロットが異なる場合は複数件返す。
     */
    const results = targets
      .map((target) => {
        const inventory = target.inventoryInstance;
        const record = inventory.stocktakeRecords[0];

        const codes = [
          inventory.item.janCode,
          inventory.item.systemBarcode,
          inventory.item.managementCode,
          inventory.managementCode,
        ].map(normalizeCode);

        if (!codes.includes(normalizedCode)) {
          return null;
        }

        return {
          id: inventory.id,
          expectedQuantity: target.expectedQuantity,
          countedQuantity: record?.countedQuantity ?? null,
          isRecorded: Boolean(record),
          lotNo: inventory.lotNo,
          expirationDate: inventory.expirationDate,
          unit: inventory.unit,
          item: {
            id: inventory.item.id,
            name: inventory.item.name,
            janCode: inventory.item.janCode,
            systemBarcode: inventory.item.systemBarcode,
            managementCode: inventory.item.managementCode,
            manufacturer: inventory.item.manufacturer,
            majorCategory: inventory.item.majorCategory,
            minorCategory: inventory.item.minorCategory,
          },
          storageLocation: inventory.storageLocation
            ? {
                id: inventory.storageLocation.id,
                name: inventory.storageLocation.name,
              }
            : null,
        };
      })
      .filter(
        (
          target
        ): target is NonNullable<typeof target> =>
          target !== null
      );

    return NextResponse.json({
      success: true,
      code,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error(
      "GET /api/stocktake/session/[id]/lookup",
      error
    );

    return NextResponse.json(
      {
        code: "STOCKTAKE_LOOKUP_500",
        message:
          "バーコードによる棚卸対象の照合に失敗しました。",
      },
      { status: 500 }
    );
  }
}
