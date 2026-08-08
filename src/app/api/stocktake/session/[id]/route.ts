import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser } from "@/lib/auth";

type Action = "PAUSE" | "RESUME" | "COMPLETE";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      { message: "ログインが必要です。" },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action as Action;

    if (!["PAUSE", "RESUME", "COMPLETE"].includes(action)) {
      return NextResponse.json(
        { message: "操作が正しくありません。" },
        { status: 400 }
      );
    }

    const session = await prisma.stocktakeSession.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        status: true,
        operatorUserId: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { message: "棚卸が見つかりません。" },
        { status: 404 }
      );
    }

    if (session.operatorUserId !== user.id) {
      return NextResponse.json(
        { message: "この棚卸を操作する権限がありません。" },
        { status: 403 }
      );
    }

    if (action === "PAUSE") {
      if (session.status !== "IN_PROGRESS") {
        return NextResponse.json(
          { message: "この棚卸は中断できません。" },
          { status: 400 }
        );
      }

      const updated = await prisma.stocktakeSession.update({
        where: {
          id,
        },
        data: {
          status: "PAUSED",
          pausedAt: new Date(),
        },
      });

      return NextResponse.json(updated);
    }

    if (action === "RESUME") {
      if (session.status !== "PAUSED") {
        return NextResponse.json(
          { message: "この棚卸は再開できません。" },
          { status: 400 }
        );
      }

      const updated = await prisma.stocktakeSession.update({
        where: {
          id,
        },
        data: {
          status: "IN_PROGRESS",
          pausedAt: null,
        },
      });

      return NextResponse.json(updated);
    }

    if (session.status === "COMPLETED") {
      return NextResponse.json(
        { message: "この棚卸はすでに完了しています。" },
        { status: 400 }
      );
    }

    const updated = await prisma.stocktakeSession.update({
      where: {
        id,
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "棚卸状態の更新に失敗しました。" },
      { status: 500 }
    );
  }
}