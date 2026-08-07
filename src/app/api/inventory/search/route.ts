import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Filter = "ALL" | "UNRECORDED" | "RECORDED" | "DIFFERENCE";

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
        { message: "棚卸セッションIDがありません" },
        { status: 400 }
      );
    }

    const conditions: Prisma.StocktakeTargetWhereInput[] = [
      { sessionId },
    ];

    if (keyword) {
      conditions.push({
        inventoryInstance: {
          OR: [
            {
              item: {
                name: {
                  contains: keyword,
                  mode: "insensitive",
                },
              },
            },
            {
              item: {
                janCode: {
                  contains: keyword,
                  mode: "insensitive",
                },
              },
            },
            {
              item: {
                managementCode: {
                  contains: keyword,
                  mode: "insensitive",
                },
              },
            },
            {
              item: {
                manufacturer: {
                  contains: keyword,
                  mode: "insensitive",
                },
              },
            },
          ],
        },
      });
    }

    if (filter === "RECORDED" || filter === "DIFFERENCE") {
      conditions.push({
        inventoryInstance: {
          stocktakeRecords: {
            some: { sessionId },
          },
        },
      });
    }

    if (filter === "UNRECORDED") {
      conditions.push({
        inventoryInstance: {
          stocktakeRecords: {
            none: { sessionId },
          },
        },
      });
    }

    const targets = await prisma.stocktakeTarget.findMany({
      where: {
        AND: conditions,
      },
      include: {
        inventoryInstance: {
          include: {
            item: true,
            storageLocation: true,
            stocktakeRecords: {
              where: { sessionId },
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
      take: 100,
    });

    const results = targets.map((target) => {
      const { stocktakeRecords, ...inventory } =
        target.inventoryInstance;

      const record = stocktakeRecords[0];

      return {
        ...inventory,
        expectedQuantity: target.expectedQuantity,
        isRecorded: Boolean(record),
        countedQuantity: record?.countedQuantity ?? null,
      };
    });

    const filteredResults =
      filter === "DIFFERENCE"
        ? results.filter(
            (item) =>
              item.isRecorded &&
              item.countedQuantity !== item.expectedQuantity
          )
        : results;

    return NextResponse.json(filteredResults);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "在庫検索に失敗しました" },
      { status: 500 }
    );
  }
}