import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AUTH_COOKIE,
  createSessionToken,
  getLoggedInUser,
  hashPassword,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";

export async function PATCH(request: NextRequest) {
  const currentUser = getLoggedInUser(request);

  if (!currentUser) {
    return NextResponse.json(
      {
        code: "AUTH_REQUIRED",
        message: "ログインが必要です。",
      },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    const currentPassword =
      typeof body.currentPassword === "string"
        ? body.currentPassword
        : "";

    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";

    const isTemporaryPasswordReset = currentUser.mustChangePassword;

    if ((!isTemporaryPasswordReset && !currentPassword) || !newPassword) {
      return NextResponse.json(
        {
          code: "PASSWORD_INPUT_REQUIRED",
          message: isTemporaryPasswordReset
            ? "新しいパスワードを入力してください。"
            : "現在のパスワードと新しいパスワードを入力してください。",
        },
        { status: 400 }
      );
    }

    if (newPassword.length < 10) {
      return NextResponse.json(
        {
          code: "PASSWORD_TOO_SHORT",
          message: "新しいパスワードは10文字以上で入力してください。",
        },
        { status: 400 }
      );
    }

    const user = await prisma.appUser.findUnique({
      where: {
        id: currentUser.id,
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        {
          code: "USER_NOT_AVAILABLE",
          message: "ユーザー情報を確認できませんでした。",
        },
        { status: 401 }
      );
    }

    const isCorrectPassword = isTemporaryPasswordReset
      ? true
      : await verifyPassword(currentPassword, user.passwordHash);

    if (!isCorrectPassword) {
      return NextResponse.json(
        {
          code: "CURRENT_PASSWORD_INCORRECT",
          message: "現在のパスワードが正しくありません。",
        },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.appUser.update({
      where: {
        id: user.id,
      },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        mustChangePassword: true,
      },
    });

    const response = NextResponse.json({
      message: "パスワードを変更しました。",
    });

    // 古い「変更必須」のログイン情報を新しいものに更新
    response.cookies.set(
      AUTH_COOKIE,
      createSessionToken(updatedUser),
      sessionCookieOptions
    );

    return response;
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        code: "PASSWORD_CHANGE_FAILED",
        message: "パスワードを変更できませんでした。",
      },
      { status: 500 }
    );
  }
}
