import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_ELEVATION_COOKIE,
  adminElevationCookieOptions,
  createAdminElevationToken,
  getLoggedInUser,
  verifyPassword,
} from "@/lib/auth";
import { createAdminActionLog } from "@/lib/error-report";
import { prisma } from "@/lib/prisma";

type RequestBody = {
  username?: unknown;
  password?: unknown;
  errorReportId?: unknown;
  route?: unknown;
  sessionId?: unknown;
};

function getText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = getLoggedInUser(request);

    if (!currentUser) {
      return NextResponse.json(
        {
          success: false,
          code: "ADMIN_REAUTH_AUTH_401",
          message: "ログイン情報を確認できませんでした。",
        },
        { status: 401 }
      );
    }

    const body = (await request.json()) as RequestBody;

    const username = getText(body.username, 100);
    const password = getText(body.password, 200);
    const errorReportId = getText(body.errorReportId, 100) || undefined;
    const route = getText(body.route, 500) || undefined;
    const sessionId = getText(body.sessionId, 100) || undefined;

    if (!username || !password) {
      return NextResponse.json(
        {
          success: false,
          code: "ADMIN_REAUTH_INPUT_400",
          message: "管理者IDとパスワードを入力してください。",
        },
        { status: 400 }
      );
    }

    const adminUser = await prisma.appUser.findUnique({
      where: {
        username,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        passwordHash: true,
        role: true,
        isActive: true,
      },
    });

    const validPassword =
      adminUser &&
      adminUser.isActive &&
      adminUser.role === "ADMIN" &&
      (await verifyPassword(password, adminUser.passwordHash));

    if (!validPassword || !adminUser) {
      return NextResponse.json(
        {
          success: false,
          code: "ADMIN_REAUTH_INVALID_401",
          message: "管理者IDまたはパスワードが一致しません。",
        },
        { status: 401 }
      );
    }

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "ADMIN_REAUTH_SUCCEEDED",
      route,
      errorReportId,
      targetSessionId: sessionId,
      detail: {
        authenticatedBy: currentUser.id,
        authenticatedByName: currentUser.displayName,
        reason: "棚卸画面の隠し管理者モードを有効化",
      },
    });

    const response = NextResponse.json({
      success: true,
      expiresInSeconds: 600,
      admin: {
        id: adminUser.id,
        username: adminUser.username,
        displayName: adminUser.displayName,
      },
    });

    response.cookies.set(
      ADMIN_ELEVATION_COOKIE,
      createAdminElevationToken({
        adminUserId: adminUser.id,
        authenticatedByUserId: currentUser.id,
      }),
      adminElevationCookieOptions
    );

    return response;
  } catch (error) {
    console.error("ADMIN_REAUTH_500", error);

    return NextResponse.json(
      {
        success: false,
        code: "ADMIN_REAUTH_500",
        message: "管理者認証中にエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}