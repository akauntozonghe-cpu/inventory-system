import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const histories =
    await prisma.inventoryHistory.findMany({
      include: {
        inventoryInstance: {
          include: {
            item: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

  return NextResponse.json(histories);
}