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

export async function GET(request: NextRequest) {
  try {
    const sessionId =
      request.nextUrl.searchParams.get("sessionId")?.trim() ?? "";

    const keyword =
      request.nextUrl.searchParams.get("q")?.trim() ?? "";

    const requestedFilter =
      request.nextUrl.searchParams.get("filter") ?? "ALL";

    const filter: Filter =
      requestedFilter === "UNRECORDED" ||
      requestedFilter === "RECORDED" ||
      requestedFilter === "DIFFERENCE"
        ? requestedFilter
        : "ALL";

    if (!sessionId) {
      return NextResponse.json(
        { message: "棚卸セッションIDがありません。" },
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

    const searched = targets
      .map((target) => {
        const { stocktakeRecords, ...inventory } =
          target.inventoryInstance;

        const record = stocktakeRecords[0];
        const item = inventory.item;

        const isRecorded = Boolean(record);
        const countedQuantity = record?.countedQuantity ?? null;
        const difference =
          countedQuantity === null
            ? null
            : countedQuantity - target.expectedQuantity;

        let searchScore = 0;

        if (keyword) {
          const systemBarcode = normalizeCode(item.systemBarcode);
          const janCode = normalizeCode(item.janCode);
          const itemManagementCode = normalizeCode(
            item.managementCode
          );
          const inventoryManagementCode = normalizeCode(
            inventory.managementCode
          );

          const codeCandidates = [
            systemBarcode,
            janCode,
            itemManagementCode,
            inventoryManagementCode,
          ].filter(Boolean);

          // システムバーコード・JAN・管理コードの完全一致を最優先
          if (
            systemBarcode &&
            systemBarcode === normalizedCode
          ) {
            searchScore = 1000;
          } else if (
            janCode &&
            janCode === normalizedCode
          ) {
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
            normalizedCode.length >= 4 &&
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
      .sort((a, b) => b.searchScore - a.searchScore)
      .slice(0, 100)
      .map(({ searchScore, ...item }) => item);

    return NextResponse.json(searched);
  } catch (error) {
    console.error("inventory search failed", error);

    return NextResponse.json(
      {
        code: "INVENTORY_SEARCH_500",
        message: "在庫検索に失敗しました。",
      },
      {
        status: 500,
      }
    );
  }
}