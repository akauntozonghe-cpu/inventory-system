import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const count = await prisma.appUser.count();

    if (count > 0) {
      return NextResponse.json(
        { message: "初期設定は完了しています。" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const username =
      typeof body.username === "string" ? body.username.trim() : "";

    const displayName =
      typeof body.displayName === "string"
        ? body.displayName.trim()
        : "";

    const password =
      typeof body.password === "string" ? body.password : "";

    if (!username || !displayName || !password) {
      return NextResponse.json(
        { message: "すべて入力してください。" },
        { status: 400 }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { message: "ログインIDは3文字以上で入力してください。" },
        { status: 400 }
      );
    }

    if (password.length < 10) {
      return NextResponse.json(
        { message: "パスワードは10文字以上で入力してください。" },
        { status: 400 }
      );
    }

    const user = await prisma.appUser.create({
      data: {
        username,
        displayName,
        passwordHash: await hashPassword(password),
        role: "ADMIN",
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "管理者アカウントを作成できませんでした。" },
      { status: 500 }
    );
  }
}