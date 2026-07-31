import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: Request,
  { params }: Params
) {
  try {
    const { id } = await params;

    const total = await prisma.inventoryInstance.count();

    const completed = await prisma.stocktakeRecord.count({
      where: {
        sessionId: id,
      },
    });

    return NextResponse.json({
      total,
      completed,
      remaining: total - completed,
      percent:
        total === 0
          ? 0
          : Math.round((completed / total) * 100),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "取得に失敗しました" },
      { status: 500 }
    );
  }
}