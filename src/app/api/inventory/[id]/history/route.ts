import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const history =
    await prisma.inventoryHistory.findMany({
      where: {
        inventoryInstanceId: id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

  return NextResponse.json(history);
}