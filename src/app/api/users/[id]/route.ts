import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser, isAdmin } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = getLoggedInUser(request);

  if (!currentUser || !isAdmin(currentUser)) {
    return NextResponse.json(
      { message: "管理者権限が必要です。" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();

    if (typeof body.isActive !== "boolean") {
      return NextResponse.json(
        { message: "有効・停止の指定が正しくありません。" },
        { status: 400 }
      );
    }

    if (id === currentUser.id && body.isActive === false) {
      return NextResponse.json(
        { message: "ログイン中の自分自身は停止できません。" },
        { status: 400 }
      );
    }

    const user = await prisma.appUser.update({
      where: {
        id,
      },
      data: {
        isActive: body.isActive,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "ユーザー状態を更新できませんでした。" },
      { status: 500 }
    );
  }
}