import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser, hasAdminAccess } from "@/lib/auth";

type FilterType = "UNRECORDED" | "RECORDED" | "DIFFERENCE" | "ALL";

function isFilterType(value: string | null): value is FilterType {
  return (
    value === "UNRECORDED" ||
    value === "RECORDED" ||
    value === "DIFFERENCE" ||
    value === "ALL"
  );
}

export async function GET(request: NextRequest) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "INVENTORY_SEARCH_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);

    const sessionId = searchParams.get("sessionId")?.trim() ?? "";
    const keyword = searchParams.get("q")?.trim() ?? "";
    const exact = searchParams.get("exact") === "true";
    const majorCategory = searchParams.get("majorCategory")?.trim() ?? "";
    const rawFilter = searchParams.get("filter");

    const filter: FilterType = isFilterType(rawFilter)
      ? rawFilter
      : "UNRECORDED";

    if (!sessionId) {
      return NextResponse.json(
        {
          code: "INVENTORY_SEARCH_SESSION_REQUIRED",
          message: "棚卸セッションを指定してください。",
        },
        { status: 400 }
      );
    }

    const session = await prisma.stocktakeSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        operatorUserId: true,
        status: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          code: "INVENTORY_SEARCH_SESSION_NOT_FOUND",
          message: "棚卸セッションが見つかりません。",
        },
        { status: 404 }
      );
    }

    const isAdmin = hasAdminAccess(request);
    const isOperator =
      session.operatorUserId === null ||
      session.operatorUserId === user.id;

    if (!isOperator && !isAdmin) {
      return NextResponse.json(
        {
          code: "INVENTORY_SEARCH_FORBIDDEN",
          message: "この棚卸を表示する権限がありません。",
        },
        { status: 403 }
      );
    }

    const inventoryFilters: Prisma.InventoryInstanceWhereInput[] = [];

    if (majorCategory) {
      inventoryFilters.push({
        item: {
          is: {
            majorCategory,
          },
        },
      });
    }

    if (keyword) {
      const textCondition = exact
        ? keyword
        : {
            contains: keyword,
            mode: Prisma.QueryMode.insensitive,
          };

      inventoryFilters.push({
        OR: [
          {
            item: {
              is: {
                janCode: textCondition,
              },
            },
          },
          {
            item: {
              is: {
                systemBarcode: textCondition,
              },
            },
          },
          {
            item: {
              is: {
                name: textCondition,
              },
            },
          },
          {
            item: {
              is: {
                managementCode: textCondition,
              },
            },
          },
          {
            item: {
              is: {
                managementGroupCode: textCondition,
              },
            },
          },
          {
            item: {
              is: {
                manufacturer: textCondition,
              },
            },
          },
          {
            item: {
              is: {
                majorCategory: textCondition,
              },
            },
          },
          {
            item: {
              is: {
                minorCategory: textCondition,
              },
            },
          },
          {
            managementCode: textCondition,
          },
          {
            managementGroupCode: textCondition,
          },
          {
            manufacturer: textCondition,
          },
          {
            majorCategory: textCondition,
          },
          {
            minorCategory: textCondition,
          },
          {
            lotNo: textCondition,
          },
          {
            storageLocation: {
              is: {
                name: textCondition,
              },
            },
          },
        ],
      });
    }

    const where: Prisma.StocktakeTargetWhereInput = {
      sessionId,
      ...(inventoryFilters.length > 0
        ? {
            inventoryInstance: {
              is: {
                AND: inventoryFilters,
              },
            },
          }
        : {}),
    };

    const targets = await prisma.stocktakeTarget.findMany({
      where,
      include: {
        inventoryInstance: {
          include: {
            item: true,
            storageLocation: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 1000,
    });

    const records = await prisma.stocktakeRecord.findMany({
      where: {
        sessionId,
        inventoryInstanceId: {
          in: targets.map((target) => target.inventoryInstanceId),
        },
      },
      select: {
        inventoryInstanceId: true,
        countedQuantity: true,
        memo: true,
        updatedAt: true,
      },
    });

    const recordMap = new Map(
      records.map((record) => [record.inventoryInstanceId, record])
    );

    const result = targets
      .map((target) => {
        const inventory = target.inventoryInstance;
        const record = recordMap.get(inventory.id);

        const countedQuantity = record?.countedQuantity ?? null;
        const difference =
          countedQuantity === null
            ? null
            : countedQuantity - target.expectedQuantity;

        return {
          id: inventory.id,
          expectedQuantity: target.expectedQuantity,
          isRecorded: countedQuantity !== null,
          countedQuantity,
          difference,
          memo: record?.memo ?? null,
          recordedAt: record?.updatedAt.toISOString() ?? null,

          lotNo: inventory.lotNo,
          expirationDate: inventory.expirationDate,
          unit: inventory.unit ?? inventory.item.defaultUnit,

          storageLocation: inventory.storageLocation
            ? {
                id: inventory.storageLocation.id,
                name: inventory.storageLocation.name,
              }
            : null,

          item: {
            id: inventory.item.id,
            name: inventory.item.name,
            janCode: inventory.item.janCode,
            systemBarcode: inventory.item.systemBarcode,
            managementCode:
              inventory.managementCode ?? inventory.item.managementCode,
            managementGroupCode:
              inventory.managementGroupCode ??
              inventory.item.managementGroupCode,
            manufacturer: inventory.manufacturer ?? inventory.item.manufacturer,
            majorCategory:
              inventory.majorCategory ?? inventory.item.majorCategory,
            minorCategory:
              inventory.minorCategory ?? inventory.item.minorCategory,
            defaultUnit: inventory.item.defaultUnit,
          },
        };
      })
      .filter((inventory) => {
        if (filter === "ALL") {
          return true;
        }

        if (filter === "UNRECORDED") {
          return !inventory.isRecorded;
        }

        if (filter === "RECORDED") {
          return inventory.isRecorded;
        }

        return inventory.difference !== null && inventory.difference !== 0;
      });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/inventory/search", error);

    return NextResponse.json(
      {
        code: "INVENTORY_SEARCH_FAILED",
        message: "棚卸対象の検索に失敗しました。",
      },
      { status: 500 }
    );
  }
}