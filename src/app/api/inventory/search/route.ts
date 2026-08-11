import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Filter = "ALL" | "UNRECORDED" | "RECORDED" | "DIFFERENCE";

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ja-JP");
}

function normalizeCode(value: string | null | undefined) {
  return normalizeText(value).replace(/[\s-]/g, "");
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

const targetInclude = {
  inventoryInstance: {
    include: {
      item: true,
      storageLocation: true,
      stocktakeRecords: {
        where: {
          sessionId: "",
        },
        select: {
          countedQuantity: true,
        },
      },
    },
  },
} as const;

export async function GET(request: NextRequest) {
  try {
    const sessionId =
      request.nextUrl.searchParams.get("sessionId")?.trim() ?? "";
    const keyword =
      request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const majorCategory =
      request.nextUrl.searchParams.get("majorCategory")?.trim() ?? "";
    const filter = getFilter(request.nextUrl.searchParams.get("filter"));
    const exactOnly = request.nextUrl.searchParams.get("exact") === "1";

    if (!sessionId) {
      return NextResponse.json(
        {
          code: "INVENTORY_SEARCH_SESSION_REQUIRED",
          message: "棚卸セッションIDがありません。",
        },
        { status: 400 }
      );
    }

    const include = {
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
    } as const;

    const directCodeConditions = keyword
      ? [
          {
            inventoryInstance: {
              is: {
                item: {
                  is: {
                    janCode: keyword,
                  },
                },
              },
            },
          },
          {
            inventoryInstance: {
              is: {
                item: {
                  is: {
                    systemBarcode: keyword,
                  },
                },
              },
            },
          },
          {
            inventoryInstance: {
              is: {
                item: {
                  is: {
                    managementCode: keyword,
                  },
                },
              },
            },
          },
          {
            inventoryInstance: {
              is: {
                managementCode: keyword,
              },
            },
          },
        ]
      : [];

    let targets = exactOnly
      ? await prisma.stocktakeTarget.findMany({
          where: {
            sessionId,
            OR: directCodeConditions,
          },
          include,
          orderBy: {
            createdAt: "asc",
          },
        })
      : [];

    // JANがハイフン付きなどで登録されている場合も、
    // 下の正規化比較で確実に探せるようにする。
    if (!exactOnly || targets.length === 0) {
      targets = await prisma.stocktakeTarget.findMany({
        where: {
          sessionId,
        },
        include,
        orderBy: {
          createdAt: "asc",
        },
      });
    }

    const normalizedKeyword = normalizeText(keyword);
    const normalizedCode = normalizeCode(keyword);
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
          const codes = [
            item.janCode,
            item.systemBarcode,
            item.managementCode,
            inventory.managementCode,
          ]
            .map(normalizeCode)
            .filter(Boolean);

          if (codes.some((code) => code === normalizedCode)) {
            searchScore = 1000;
          } else if (
            normalizedCode.length >= 3 &&
            codes.some((code) => code.startsWith(normalizedCode))
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
              .map(normalizeText)
              .filter(Boolean);

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