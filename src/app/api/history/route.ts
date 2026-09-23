import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const inventoryId = request.nextUrl.searchParams.get("inventoryId");
  const histories =
    await prisma.inventoryHistory.findMany({
      where: inventoryId ? { inventoryInstanceId: inventoryId } : {},
      include: {
        inventoryInstance: {
          include: {
            item: true,
            storageLocation: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

  return NextResponse.json(histories);
}