import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser, hasAdminAccess } from "@/lib/auth";
import { withDatabaseRetry } from "@/lib/database-retry";

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

    const session = await withDatabaseRetry(() => prisma.stocktakeSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        operatorUserId: true,
        status: true,
        scopeType: true,
        scopeValue: true,
      },
    }));

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
    const normalizedKeyword = normalizeCode(keyword);

    if (exact && normalizedKeyword) {
      // 棚卸開始後に登録・変更された商品も、読取時点の最新DBから対象へ反映する。
      const currentInventories = await withDatabaseRetry(() => prisma.inventoryInstance.findMany({
        where: { status: { not: "廃止" } },
        select: {
          id: true, quantity: true, managementCode: true, managementGroupCode: true, majorCategory: true, minorCategory: true,
          storageLocation: { select: { name: true } },
          item: { select: { janCode: true, systemBarcode: true, managementCode: true, managementGroupCode: true, majorCategory: true, minorCategory: true } },
        },
        take: 5000,
      }));
      const currentMatches = currentInventories.filter((inventory) => {
        const codes = [inventory.item.janCode, inventory.item.systemBarcode, inventory.item.managementCode, inventory.item.managementGroupCode, inventory.managementCode, inventory.managementGroupCode].map(normalizeCode);
        return codes.includes(normalizedKeyword) && matchesSessionScope(inventory, session);
      });
      if (currentMatches.length > 0) {
        await withDatabaseRetry(() => prisma.$transaction(currentMatches.map((inventory) => prisma.stocktakeTarget.upsert({
          where: { sessionId_inventoryInstanceId: { sessionId, inventoryInstanceId: inventory.id } },
          update: {},
          create: { sessionId, inventoryInstanceId: inventory.id, expectedQuantity: inventory.quantity },
        }))));
      }
    }

    if (majorCategory) {
      inventoryFilters.push({
        item: {
          is: {
            majorCategory,
          },
        },
      });
    }

    if (keyword && !exact) {
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

    const targets = await withDatabaseRetry(() => prisma.stocktakeTarget.findMany({
      where,
      select: {
        inventoryInstanceId: true,
        expectedQuantity: true,
        inventoryInstance: {
          select: {
            id: true,
            managementCode: true,
            managementGroupCode: true,
            manufacturer: true,
            majorCategory: true,
            minorCategory: true,
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
                managementGroupCode: true,
                manufacturer: true,
                majorCategory: true,
                minorCategory: true,
                defaultUnit: true,
              },
            },
            storageLocation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 1000,
    }));

    const records = await withDatabaseRetry(() => prisma.stocktakeRecord.findMany({
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
    }));

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
        if (!exact || !normalizedKeyword) return true;
        return [inventory.item.janCode, inventory.item.systemBarcode, inventory.item.managementCode, inventory.item.managementGroupCode].map(normalizeCode).includes(normalizedKeyword);
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
        message: "最新の商品情報による棚卸検索に失敗しました。自動復旧後も解決しない場合は管理者へお問い合わせください。",
        action: "入力内容を変えずに『今すぐ自動復旧』を実行してください。",
        recoveryRoute: "/admin/error-reports",
      },
      { status: 500 }
    );
  }
}

function normalizeCode(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").replace(/[\s\-‐‑‒–—―ー]/g, "").toLowerCase();
}

function matchesSessionScope(
  inventory: { majorCategory: string | null; minorCategory: string | null; storageLocation: { name: string } | null; item: { majorCategory: string | null; minorCategory: string | null } },
  session: { scopeType: "ALL" | "LOCATION" | "MAJOR_CATEGORY" | "MINOR_CATEGORY"; scopeValue: string | null }
) {
  if (session.scopeType === "ALL") return true;
  if (!session.scopeValue) return false;
  if (session.scopeType === "LOCATION") return inventory.storageLocation?.name === session.scopeValue;
  if (session.scopeType === "MAJOR_CATEGORY") return (inventory.majorCategory ?? inventory.item.majorCategory) === session.scopeValue;
  return (inventory.minorCategory ?? inventory.item.minorCategory) === session.scopeValue;
}
