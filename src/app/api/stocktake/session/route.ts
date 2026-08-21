import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const activeOnly =
      req.nextUrl.searchParams.get("active") === "true";

    const sessions = await prisma.stocktakeSession.findMany({
      where: activeOnly
        ? {
            status: {
              in: ["IN_PROGRESS", "PAUSED"],
            },
          }
        : undefined,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        title: true,
        operator: true,
        location: true,
        memo: true,
        scopeType: true,
        scopeLabel: true,
        status: true,
        startedAt: true,
        pausedAt: true,
        completedAt: true,
        createdAt: true,
        _count: {
          select: {
            targets: true,
            records: true,
          },
        },
      },
    });

    return NextResponse.json(
      sessions.map((session) => ({
        ...session,
        targetCount: session._count.targets,
        recordedCount: session._count.records,
      }))
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "棚卸セッション一覧の取得に失敗しました。",
      },
      {
        status: 500,
      }
    );
  }
}