import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [locations, majorCategories, minorCategories] =
      await Promise.all([
        prisma.storageLocation.findMany({
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: "asc",
          },
        }),

        prisma.item.findMany({
          where: {
            majorCategory: {
              not: null,
            },
          },
          distinct: ["majorCategory"],
          select: {
            majorCategory: true,
          },
          orderBy: {
            majorCategory: "asc",
          },
        }),

        prisma.item.findMany({
          where: {
            minorCategory: {
              not: null,
            },
          },
          distinct: ["minorCategory"],
          select: {
            minorCategory: true,
          },
          orderBy: {
            minorCategory: "asc",
          },
        }),
      ]);

    return NextResponse.json({
      locations,
      majorCategories: majorCategories
        .map((item) => item.majorCategory)
        .filter((category): category is string => Boolean(category)),
      minorCategories: minorCategories
        .map((item) => item.minorCategory)
        .filter((category): category is string => Boolean(category)),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "棚卸対象の選択肢を取得できませんでした" },
      { status: 500 }
    );
  }
}