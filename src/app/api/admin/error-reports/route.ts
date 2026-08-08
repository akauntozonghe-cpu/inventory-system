import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser, isAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const currentUser = getLoggedInUser(req);

    if (!isAdmin(currentUser)) {
      return NextResponse.json(
        {
          message: "管理者権限が必要です。",
        },
        {
          status: 403,
        }
      );
    }

    const reports = await prisma.errorReport.findMany({
      orderBy: {
        occurredAt: "desc",
      },
      take: 100,
      include: {
        reporterUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
        adminActionLogs: {
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
          include: {
            adminUser: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(reports);
  } catch (error) {
    console.error("エラーレポート一覧取得エラー", error);

    return NextResponse.json(
      {
        message: "エラーレポート一覧を取得できませんでした。",
      },
      {
        status: 500,
      }
    );
  }
}