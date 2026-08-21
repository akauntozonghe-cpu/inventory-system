import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Filter = "ALL" | "UNRECORDED" | "RECORDED" | "DIFFERENCE";
type QrType = "PRODUCT" | "MAJOR_CATEGORY" | "MINOR_CATEGORY" | "LOCATION";

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim() ?? "";
    const keyword = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const qrType = (req.nextUrl.searchParams.get("qrType") ?? "PRODUCT") as QrType;
    const filter = (req.nextUrl.searchParams.get("filter") ?? "ALL") as Filter;

    if (!sessionId) {
      return NextResponse.json({ message: "棚卸セッションIDがありません" }, { status: 400 });
    }

    const conditions: Prisma.StocktakeTargetWhereInput[] = [{ sessionId }];

    if (keyword && qrType === "MAJOR_CATEGORY") {
      conditions.push({ inventoryInstance: { OR: [
        { majorCategory: keyword },
        { item: { majorCategory: keyword } },
      ] } });
    } else if (keyword && qrType === "MINOR_CATEGORY") {
      conditions.push({ inventoryInstance: { OR: [
        { minorCategory: keyword },
        { item: { minorCategory: keyword } },
      ] } });
    } else if (keyword && qrType === "LOCATION") {
      conditions.push({ inventoryInstance: { storageLocation: { name: keyword } } });
    } else if (keyword) {
      conditions.push({
        inventoryInstance: {
          OR: [
            { item: { name: { contains: keyword, mode: "insensitive" } } },
            { item: { janCode: { contains: keyword, mode: "insensitive" } } },
            { item: { managementCode: { contains: keyword, mode: "insensitive" } } },
            { item: { manufacturer: { contains: keyword, mode: "insensitive" } } },
            { item: { majorCategory: { contains: keyword, mode: "insensitive" } } },
            { item: { minorCategory: { contains: keyword, mode: "insensitive" } } },
            { storageLocation: { name: { contains: keyword, mode: "insensitive" } } },
          ],
        },
      });
    }

    if (filter === "RECORDED" || filter === "DIFFERENCE") {
      conditions.push({ inventoryInstance: { stocktakeRecords: { some: { sessionId } } } });
    }
    if (filter === "UNRECORDED") {
      conditions.push({ inventoryInstance: { stocktakeRecords: { none: { sessionId } } } });
    }

    const targets = await prisma.stocktakeTarget.findMany({
      where: { AND: conditions },
      include: {
        inventoryInstance: {
          include: {
            item: true,
            storageLocation: true,
            stocktakeRecords: {
              where: { sessionId },
              select: { countedQuantity: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: qrType === "PRODUCT" ? 100 : 500,
    });

    const results = targets.map((target) => {
      const { stocktakeRecords, ...inventory } = target.inventoryInstance;
      const record = stocktakeRecords[0];
      return {
        ...inventory,
        expectedQuantity: target.expectedQuantity,
        isRecorded: Boolean(record),
        countedQuantity: record?.countedQuantity ?? null,
      };
    });

    return NextResponse.json(
      filter === "DIFFERENCE"
        ? results.filter((item) => item.countedQuantity !== item.expectedQuantity)
        : results
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "在庫検索に失敗しました" }, { status: 500 });
  }
}
