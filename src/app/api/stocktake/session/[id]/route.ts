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

    const session = await prisma.stocktakeSession.findUnique({
      where: {
        id,
      },
    });

    if (!session) {
      return NextResponse.json(
        { message: "セッションが見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "取得に失敗しました" },
      { status: 500 }
    );
  }
}