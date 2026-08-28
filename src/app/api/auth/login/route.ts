import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AUTH_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  console.log("=== LOGIN API START ===");

  try {
    const body = (await request.json()) as Record<string, unknown>;

    console.log("LOGIN BODY RECEIVED");

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

    console.log("LOGIN USERNAME:", username);

    const user = await prisma.appUser.findUnique({
      where: {
        username,
      },
    });

    console.log("USER SEARCH FINISHED:", Boolean(user));

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

    console.log("PASSWORD CHECK:", passwordMatches);

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
      featurePermissions: user.featurePermissions,
    };

    console.log("CREATING SESSION");

    const token = createSessionToken(sessionUser);

    const response = NextResponse.json(
      {
        success: true,
        user: sessionUser,
      },
      {
        status: 200,
      }
    );

    response.cookies.set(
      AUTH_COOKIE,
      token,
      sessionCookieOptions
    );

    console.log("=== LOGIN SUCCESS ===");

    return response;
  } catch (error) {
    console.error("=== LOGIN ERROR ===");
    console.error(error);

    return NextResponse.json(
      {
        code: "AUTH_LOGIN_500",
        message:
          error instanceof Error
            ? error.message
            : "ログイン処理中に不明なエラーが発生しました。",
        errorType:
          error instanceof Error
            ? error.name
            : typeof error,
      },
      {
        status: 500,
      }
    );
  }
}
