import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser } from "@/lib/auth";

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => value.trim())
    .sort((a, b) => a.localeCompare(b, "ja"));
}

export async function GET(request: NextRequest) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "STOCKTAKE_OPTIONS_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const [locations, inventories] = await Promise.all([
      prisma.storageLocation.findMany({
        select: {
          name: true,
        },
        orderBy: {
          name: "asc",
        },
      }),

      prisma.inventoryInstance.findMany({
        select: {
          majorCategory: true,
          minorCategory: true,
          item: {
            select: {
              majorCategory: true,
              minorCategory: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      code: "STOCKTAKE_OPTIONS_OK",

      storageLocations: uniqueSorted(locations.map((location) => location.name)),

      majorCategories: uniqueSorted(
        inventories.flatMap((inventory) => [
          inventory.majorCategory,
          inventory.item.majorCategory,
        ])
      ),

      minorCategories: uniqueSorted(
        inventories.flatMap((inventory) => [
          inventory.minorCategory,
          inventory.item.minorCategory,
        ])
      ),
    });
  } catch (error) {
    console.error("GET /api/stocktake/options", error);

    return NextResponse.json(
      {
        code: "STOCKTAKE_OPTIONS_FAILED",
        message: "棚卸範囲の選択肢を取得できませんでした。",
      },
      { status: 500 }
    );
  }
}