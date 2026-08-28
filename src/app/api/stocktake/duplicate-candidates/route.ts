import { NextRequest, NextResponse } from "next/server";
import { getLoggedInUser } from "@/lib/auth";
import { duplicateScore } from "@/lib/duplicate-detection";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = getLoggedInUser(request);
  if (!user) {
    return NextResponse.json({ code: "DUPLICATE_AUTH_401", message: "ログインが必要です。" }, { status: 401 });
  }

  const input = {
    name: request.nextUrl.searchParams.get("name"),
    janCode: request.nextUrl.searchParams.get("janCode"),
    managementCode: request.nextUrl.searchParams.get("managementCode"),
    manufacturer: request.nextUrl.searchParams.get("manufacturer"),
    lotNo: request.nextUrl.searchParams.get("lotNo"),
    storageLocationId: request.nextUrl.searchParams.get("storageLocationId"),
  };

  if (!input.name?.trim() && !input.janCode?.trim() && !input.managementCode?.trim()) {
    return NextResponse.json([]);
  }

  try {
    const items = await prisma.item.findMany({
    where: {
      isArchived: false,
      OR: [
        ...(input.janCode ? [{ janCode: input.janCode.trim() }] : []),
        ...(input.managementCode ? [{ managementCode: input.managementCode.trim() }] : []),
        ...(input.name
          ? [{ name: { contains: input.name.trim(), mode: "insensitive" as const } }]
          : []),
      ],
    },
    take: 20,
    include: {
      inventoryInstances: {
        select: {
          lotNo: true,
          storageLocationId: true,
          quantity: true,
          actualQuantity: true,
          storageLocation: { select: { name: true } },
        },
      },
    },
  });

    const candidates = items
    .flatMap((item) => {
      const inventories = item.inventoryInstances.length
        ? item.inventoryInstances
        : [{ lotNo: null, storageLocationId: null, quantity: 0, actualQuantity: null, storageLocation: null }];
      return inventories.map((inventory) => {
        const match = duplicateScore(input, {
          name: item.name,
          janCode: item.janCode,
          managementCode: item.managementCode,
          manufacturer: item.manufacturer,
          lotNo: inventory.lotNo,
          storageLocationId: inventory.storageLocationId,
        });
        return {
          itemId: item.id,
          name: item.name,
          janCode: item.janCode,
          managementCode: item.managementCode,
          manufacturer: item.manufacturer,
          lotNo: inventory.lotNo,
          locationName: inventory.storageLocation?.name ?? null,
          quantity: inventory.actualQuantity ?? inventory.quantity,
          ...match,
        };
      });
    })
    .filter((candidate) => candidate.likelyDuplicate)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

    return NextResponse.json(candidates);
  } catch (error) {
    console.error("GET /api/stocktake/duplicate-candidates", error);
    return NextResponse.json(
      { code: "DUPLICATE_CANDIDATES_500", message: "重複候補を確認できませんでした。" },
      { status: 500 }
    );
  }
}
