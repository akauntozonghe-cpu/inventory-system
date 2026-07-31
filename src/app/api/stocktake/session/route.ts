import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const session = await prisma.stocktakeSession.create({
      data: {
        title: body.title || "棚卸",
        operator: body.operator || "管理者",
      },
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "棚卸開始に失敗しました",
      },
      {
        status: 500,
      }
    );
  }
}