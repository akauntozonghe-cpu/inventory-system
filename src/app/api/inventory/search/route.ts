import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim();

    if (!q) {
      return NextResponse.json([]);
    }

    const inventories = await prisma.inventoryInstance.findMany({
      where: {
        OR: [
          {
            item: {
              name: {
                contains: q,
                mode: "insensitive",
              },
            },
          },
          {
            item: {
              janCode: {
                contains: q,
              },
            },
          },
          {
            item: {
              managementCode: {
                contains: q,
              },
            },
          },
          {
            lotNo: {
              contains: q,
            },
          },
        ],
      },

      include: {
        item: true,
        storageLocation: true,
      },

      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          item: {
            name: "asc",
          },
        },
      ],

      take: 50,
    });

    return NextResponse.json(inventories);

  } catch (error) {

    console.error("Inventory Search Error:", error);

    return NextResponse.json(
      {
        message: "検索失敗",
      },
      {
        status: 500,
      }
    );

  }
}