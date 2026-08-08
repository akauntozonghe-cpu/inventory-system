import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const userCount = await prisma.appUser.count();

    if (userCount > 0) {
      return NextResponse.json(
        {
          message:
            "初回管理者はすでに登録されています。ログイン画面からログインしてください。",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const username =
      typeof body.username === "string" ? body.username.trim() : "";

    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : "";

    const password =
      typeof body.password === "string" ? body.password : "";

    if (!username || !displayName || !password) {
      return NextResponse.json(
        { message: "すべての項目を入力してください。" },
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
        mustChangePassword: false,
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
      {
        message:
          "初回管理者の登録に失敗しました。ログインIDが重複していないか確認してください。",
      },
      { status: 500 }
    );
  }
}