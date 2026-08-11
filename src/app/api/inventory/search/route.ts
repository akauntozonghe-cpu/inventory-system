import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Filter = "ALL" | "UNRECORDED" | "RECORDED" | "DIFFERENCE";

function normalizeCode(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s-]/g, "")
    .toLowerCase();
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

function getFilter(value: string | null): Filter {
  if (
    value === "UNRECORDED" ||
    value === "RECORDED" ||
    value === "DIFFERENCE"
  ) {
    return value;
  }

  return "ALL";
}

export async function GET(request: NextRequest) {
  try {
    const sessionId =
      request.nextUrl.searchParams.get("sessionId")?.trim() ?? "";

    const keyword =
      request.nextUrl.searchParams.get("q")?.trim() ?? "";

    const majorCategory =
      request.nextUrl.searchParams.get("majorCategory")?.trim() ?? "";

    const filter = getFilter(request.nextUrl.searchParams.get("filter"));

    if (!sessionId) {
      return NextResponse.json(
        {
          code: "INVENTORY_SEARCH_SESSION_REQUIRED",
          message: "棚卸セッションIDが指定されていません。",
        },
        { status: 400 }
      );
    }

    const targets = await prisma.stocktakeTarget.findMany({
      where: {
        sessionId,
      },
      include: {
        inventoryInstance: {
          include: {
            item: true,
            storageLocation: true,
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

    const normalizedCode = normalizeCode(keyword);
    const normalizedKeyword = normalizeText(keyword);
    const normalizedMajorCategory = normalizeText(majorCategory);

    const searched = targets
      .map((target) => {
        const { stocktakeRecords, ...inventory } =
          target.inventoryInstance;

        const record = stocktakeRecords[0];
        const item = inventory.item;

        if (
          normalizedMajorCategory &&
          normalizeText(item.majorCategory) !== normalizedMajorCategory
        ) {
          return null;
        }

        const isRecorded = Boolean(record);
        const countedQuantity = record?.countedQuantity ?? null;
        const difference =
          countedQuantity === null
            ? null
            : countedQuantity - target.expectedQuantity;

        if (filter === "UNRECORDED" && isRecorded) {
          return null;
        }

        if (filter === "RECORDED" && !isRecorded) {
          return null;
        }

        if (
          filter === "DIFFERENCE" &&
          (!isRecorded || difference === 0)
        ) {
          return null;
        }

        let searchScore = 0;

        if (keyword) {
          const systemBarcode = normalizeCode(item.systemBarcode);
          const janCode = normalizeCode(item.janCode);
          const itemManagementCode = normalizeCode(item.managementCode);
          const inventoryManagementCode = normalizeCode(
            inventory.managementCode
          );

          const codeCandidates = [
            systemBarcode,
            janCode,
            itemManagementCode,
            inventoryManagementCode,
          ].filter(Boolean);

          if (systemBarcode && systemBarcode === normalizedCode) {
            searchScore = 1000;
          } else if (janCode && janCode === normalizedCode) {
            searchScore = 950;
          } else if (
            itemManagementCode &&
            itemManagementCode === normalizedCode
          ) {
            searchScore = 900;
          } else if (
            inventoryManagementCode &&
            inventoryManagementCode === normalizedCode
          ) {
            searchScore = 850;
          } else if (
            normalizedCode.length >= 3 &&
            codeCandidates.some((code) =>
              code.startsWith(normalizedCode)
            )
          ) {
            searchScore = 700;
          } else {
            const textCandidates = [
              item.name,
              item.manufacturer,
              item.majorCategory,
              item.minorCategory,
              item.managementGroupCode,
              inventory.managementGroupCode,
              inventory.lotNo,
              inventory.storageLocation?.name,
            ]
              .filter(
                (value): value is string =>
                  typeof value === "string" && value.length > 0
              )
              .map(normalizeText);

            if (
              normalizedKeyword &&
              textCandidates.some((text) =>
                text.includes(normalizedKeyword)
              )
            ) {
              searchScore = 100;
            }
          }

          if (searchScore === 0) {
            return null;
          }
        }

        return {
          ...inventory,
          expectedQuantity: target.expectedQuantity,
          isRecorded,
          countedQuantity,
          difference,
          searchScore,
        };
      })
      .filter(
        (
          item
        ): item is NonNullable<typeof item> => item !== null
      )
      .sort((left, right) => {
        if (right.searchScore !== left.searchScore) {
          return right.searchScore - left.searchScore;
        }

        if (left.isRecorded !== right.isRecorded) {
          return Number(left.isRecorded) - Number(right.isRecorded);
        }

        return left.item.name.localeCompare(right.item.name, "ja");
      })
      .map(({ searchScore, ...item }) => item);

    return NextResponse.json(searched);
  } catch (error) {
    console.error("INVENTORY_SEARCH_500", error);

    return NextResponse.json(
      {
        code: "INVENTORY_SEARCH_500",
        message: "在庫検索に失敗しました。",
      },
      { status: 500 }
    );
  }
}