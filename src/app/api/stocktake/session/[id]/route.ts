import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Action = "PAUSE" | "RESUME" | "COMPLETE";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const action = body.action as Action;

    if (!["PAUSE", "RESUME", "COMPLETE"].includes(action)) {
      return NextResponse.json(
        { message: "操作が不正です" },
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
      },
    });

    if (!session) {
      return NextResponse.json(
        { message: "棚卸セッションが見つかりません" },
        { status: 404 }
      );
    }

    if (action === "PAUSE") {
      if (session.status !== "IN_PROGRESS") {
        return NextResponse.json(
          { message: "棚卸中のセッションだけ中断できます" },
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
          { message: "中断中のセッションだけ再開できます" },
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
        { message: "この棚卸はすでに終了しています" },
        { status: 400 }
      );
    }

    // 未棚卸が残っていても終了可能。
    // 未入力分は結果画面で「未棚卸」として確認できる。
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
      { message: "棚卸状態の更新に失敗しました" },
      { status: 500 }
    );
  }
}