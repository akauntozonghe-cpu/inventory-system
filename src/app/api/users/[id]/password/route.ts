import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getLoggedInUser,
  hashPassword,
  isAdmin,
} from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = getLoggedInUser(request);

  if (!currentUser || !isAdmin(currentUser)) {
    return NextResponse.json(
      {
        code: "ADMIN_REQUIRED",
        message: "パスワード再発行は管理者のみ実行できます。",
      },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const temporaryPassword =
      typeof body.temporaryPassword === "string"
        ? body.temporaryPassword
        : "";

    if (!temporaryPassword) {
      return NextResponse.json(
        {
          code: "TEMP_PASSWORD_REQUIRED",
          message: "仮パスワードを入力してください。",
        },
        { status: 400 }
      );
    }

    if (temporaryPassword.length < 10) {
      return NextResponse.json(
        {
          code: "TEMP_PASSWORD_TOO_SHORT",
          message: "仮パスワードは10文字以上で入力してください。",
        },
        { status: 400 }
      );
    }

    if (id === currentUser.id) {
      return NextResponse.json(
        {
          code: "SELF_PASSWORD_RESET_NOT_ALLOWED",
          message:
            "自分自身のパスワードは、パスワード変更画面から変更してください。",
        },
        { status: 400 }
      );
    }

    const targetUser = await prisma.appUser.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        isActive: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json(
        {
          code: "USER_NOT_FOUND",
          message: "対象のユーザーが見つかりません。",
        },
        { status: 404 }
      );
    }

    if (!targetUser.isActive) {
      return NextResponse.json(
        {
          code: "USER_INACTIVE",
          message: "停止中のユーザーには仮パスワードを発行できません。",
        },
        { status: 400 }
      );
    }

    await prisma.appUser.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
      },
    });

    return NextResponse.json({
      message: `${targetUser.displayName} さんの仮パスワードを設定しました。`,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        code: "PASSWORD_RESET_FAILED",
        message: "仮パスワードを設定できませんでした。",
      },
      { status: 500 }
    );
  }
}