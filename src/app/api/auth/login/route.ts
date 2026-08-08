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
    const body = await request.json();

    const username =
      typeof body.username === "string"
        ? body.username.trim()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!username || !password) {
      return NextResponse.json(
        { message: "ログインIDとパスワードを入力してください。" },
        { status: 400 }
      );
    }

    const user = await prisma.appUser.findUnique({
      where: {
        username,
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { message: "ログインIDまたはパスワードが正しくありません。" },
        { status: 401 }
      );
    }

    const correct = await verifyPassword(
      password,
      user.passwordHash
    );

    if (!correct) {
      return NextResponse.json(
        { message: "ログインIDまたはパスワードが正しくありません。" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    });

    response.cookies.set(
      AUTH_COOKIE,
      createSessionToken({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      }),
      sessionCookieOptions
    );

    return response;
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "ログイン処理に失敗しました。" },
      { status: 500 }
    );
  }
}