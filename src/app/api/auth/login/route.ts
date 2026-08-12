import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AUTH_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const username =
      typeof body.username === "string" ? body.username.trim() : "";

    const password =
      typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        {
          code: "AUTH_LOGIN_INPUT_REQUIRED",
          message: "ログインIDとパスワードを入力してください。",
        },
        { status: 400 }
      );
    }

    const user = await prisma.appUser.findUnique({
      where: { username },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        {
          code: "AUTH_LOGIN_FAILED",
          message:
            "ログインIDまたはパスワードが正しくないか、このユーザーは無効です。",
        },
        { status: 401 }
      );
    }

    const passwordMatches = await verifyPassword(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return NextResponse.json(
        {
          code: "AUTH_LOGIN_FAILED",
          message: "ログインIDまたはパスワードが正しくありません。",
        },
        { status: 401 }
      );
    }

    const sessionUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };

    const response = NextResponse.json(
      {
        success: true,
        user: sessionUser,
      },
      { status: 200 }
    );

    response.cookies.set(
      AUTH_COOKIE,
      createSessionToken(sessionUser),
      sessionCookieOptions
    );

    return response;
  } catch (error) {
    console.error("POST /api/auth/login", error);

    return NextResponse.json(
      {
        code: "AUTH_LOGIN_500",
        message: "ログイン処理中にシステムエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}