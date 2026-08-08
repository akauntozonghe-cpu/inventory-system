import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createAdminActionLog,
} from "@/lib/error-report";
import { verifyPassword } from "@/lib/auth";

type RequestBody = {
  username?: unknown;
  password?: unknown;
  errorReportId?: unknown;
  route?: unknown;
  sessionId?: unknown;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;

    const username = text(body.username, 100);
    const password = text(body.password, 200);
    const errorReportId = text(body.errorReportId, 100) || undefined;
    const route = text(body.route, 500) || undefined;
    const sessionId = text(body.sessionId, 100) || undefined;

    if (!username || !password) {
      return NextResponse.json(
        {
          success: false,
          message: "管理者IDとパスワードを入力してください。",
        },
        {
          status: 400,
        }
      );
    }

    const adminUser = await prisma.appUser.findUnique({
      where: {
        username,
      },
      select: {
        id: true,
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
          message: "管理者IDまたはパスワードが一致しません。",
        },
        {
          status: 401,
        }
      );
    }

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "ADMIN_REAUTH_SUCCEEDED",
      route,
      errorReportId,
      targetSessionId: sessionId,
      detail: {
        reason: "エラー画面からの管理者認証",
      },
    });

    return NextResponse.json({
      success: true,
      admin: {
        id: adminUser.id,
        displayName: adminUser.displayName,
      },
    });
  } catch (error) {
    console.error("管理者再認証エラー", error);

    return NextResponse.json(
      {
        success: false,
        message: "管理者認証を確認できませんでした。",
      },
      {
        status: 500,
      }
    );
  }
}