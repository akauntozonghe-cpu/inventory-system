import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { action } = await req.json();
    const session = await prisma.stocktakeSession.findUnique({ where: { id }, select: { status: true } });
    if (!session) return NextResponse.json({ message: "棚卸が見つかりません" }, { status: 404 });

    if (action === "PAUSE" && session.status === "IN_PROGRESS") {
      return NextResponse.json(await prisma.stocktakeSession.update({
        where: { id }, data: { status: "PAUSED", pausedAt: new Date() },
      }));
    }
    if (action === "RESUME" && session.status === "PAUSED") {
      return NextResponse.json(await prisma.stocktakeSession.update({
        where: { id }, data: { status: "IN_PROGRESS", pausedAt: null },
      }));
    }
    if (action === "COMPLETE" && session.status !== "COMPLETED") {
      return NextResponse.json(await prisma.stocktakeSession.update({
        where: { id }, data: { status: "COMPLETED", completedAt: new Date() },
      }));
    }
    return NextResponse.json({ message: "この状態では操作できません" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "状態を更新できませんでした" }, { status: 500 });
  }
}
