import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getLoggedInUser,
  hashPassword,
  isAdmin,
} from "@/lib/auth";
import { DEFAULT_WORKER_FEATURES, normalizeFeaturePermissions } from "@/lib/feature-permissions";

export async function GET(request: NextRequest) {
  const currentUser = getLoggedInUser(request);

  if (!isAdmin(currentUser)) {
    return NextResponse.json(
      {
        code: "ADMIN_REQUIRED",
        message: "ユーザー管理は管理者のみ利用できます。",
      },
      { status: 403 }
    );
  }

  try {
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
        mustChangePassword: true,
        featurePermissions: true,
        createdAt: true,
      },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        code: "USERS_FETCH_FAILED",
        message: "ユーザー一覧を取得できませんでした。",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const currentUser = getLoggedInUser(request);

  if (!isAdmin(currentUser)) {
    return NextResponse.json(
      {
        code: "ADMIN_REQUIRED",
        message: "ユーザー登録は管理者のみ実行できます。",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    const username =
      typeof body.username === "string" ? body.username.trim() : "";

    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : "";

    const password =
      typeof body.password === "string" ? body.password : "";

    const role: "ADMIN" | "WORKER" =
      body.role === "ADMIN" ? "ADMIN" : "WORKER";
    const featurePermissions =
      role === "ADMIN"
        ? DEFAULT_WORKER_FEATURES
        : body.featurePermissions === undefined
          ? DEFAULT_WORKER_FEATURES
          : normalizeFeaturePermissions(body.featurePermissions);

    if (!username || !displayName || !password) {
      return NextResponse.json(
        {
          code: "USER_INPUT_REQUIRED",
          message: "すべての項目を入力してください。",
        },
        { status: 400 }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        {
          code: "USER_ID_TOO_SHORT",
          message: "ログインIDは3文字以上で入力してください。",
        },
        { status: 400 }
      );
    }

    if (password.length < 10) {
      return NextResponse.json(
        {
          code: "PASSWORD_TOO_SHORT",
          message: "パスワードは10文字以上で入力してください。",
        },
        { status: 400 }
      );
    }

    const alreadyExists = await prisma.appUser.findUnique({
      where: { username },
      select: { id: true },
    });

    if (alreadyExists) {
      return NextResponse.json(
        {
          code: "USERNAME_ALREADY_EXISTS",
          message: "このログインIDはすでに使われています。",
        },
        { status: 409 }
      );
    }

    const user = await prisma.appUser.create({
  data: {
    username,
    displayName,
    passwordHash: await hashPassword(password),
    role,
    featurePermissions: featurePermissions as never,
    mustChangePassword: true,
  },
  select: {
    id: true,
    username: true,
    displayName: true,
    role: true,
    isActive: true,
    mustChangePassword: true,
    featurePermissions: true,
    createdAt: true,
  },
});

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        code: "USER_CREATE_FAILED",
        message: "ユーザーを登録できませんでした。",
      },
      { status: 500 }
    );
  }
}
