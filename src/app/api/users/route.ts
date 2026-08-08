import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getLoggedInUser,
  hashPassword,
  isAdmin,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const currentUser = getLoggedInUser(request);

  if (!isAdmin(currentUser)) {
    return NextResponse.json(
      { message: "管理者権限が必要です。" },
      { status: 403 }
    );
  }

  const users = await prisma.appUser.findMany({
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const currentUser = getLoggedInUser(request);

  if (!isAdmin(currentUser)) {
    return NextResponse.json(
      { message: "管理者権限が必要です。" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    const username =
      typeof body.username === "string"
        ? body.username.trim()
        : "";

    const displayName =
      typeof body.displayName === "string"
        ? body.displayName.trim()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    const role =
      body.role === "ADMIN" ? "ADMIN" : "WORKER";

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
        role,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "ユーザーを登録できませんでした。IDが重複していないか確認してください。" },
      { status: 400 }
    );
  }
}