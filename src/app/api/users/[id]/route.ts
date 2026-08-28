import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser, isAdmin } from "@/lib/auth";
import { normalizeFeaturePermissions } from "@/lib/feature-permissions";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = getLoggedInUser(request);

  if (!currentUser || !isAdmin(currentUser)) {
    return NextResponse.json(
      {
        code: "ADMIN_REQUIRED",
        message: "ユーザー状態の変更は管理者のみ実行できます。",
      },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const hasStatus = typeof body.isActive === "boolean";
    const hasPermissions = Array.isArray(body.featurePermissions);

    if (!hasStatus && !hasPermissions) {
      return NextResponse.json(
        {
          code: "INVALID_USER_STATUS",
          message: "変更するユーザー状態または利用機能を指定してください。",
        },
        { status: 400 }
      );
    }

    if (id === currentUser.id && hasStatus && body.isActive === false) {
      return NextResponse.json(
        {
          code: "CANNOT_DISABLE_SELF",
          message: "ログイン中の自分自身は停止できません。",
        },
        { status: 400 }
      );
    }

    const targetUser = await prisma.appUser.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        isActive: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json(
        {
          code: "USER_NOT_FOUND",
          message: "対象のユーザーが見つかりません。",
        },
        { status: 404 }
      );
    }

    // 最後の有効な管理者を停止しない
    if (
      targetUser.role === "ADMIN" &&
      targetUser.isActive &&
      hasStatus && body.isActive === false
    ) {
      const activeAdminCount = await prisma.appUser.count({
        where: {
          role: "ADMIN",
          isActive: true,
        },
      });

      if (activeAdminCount <= 1) {
        return NextResponse.json(
          {
            code: "LAST_ADMIN_PROTECTED",
            message: "最後の有効な管理者は停止できません。",
          },
          { status: 400 }
        );
      }
    }

    const user = await prisma.appUser.update({
      where: { id },
      data: {
        ...(hasStatus ? { isActive: body.isActive } : {}),
        ...(hasPermissions && targetUser.role !== "ADMIN"
          ? { featurePermissions: normalizeFeaturePermissions(body.featurePermissions) }
          : {}),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        featurePermissions: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        code: "USER_STATUS_UPDATE_FAILED",
        message: "ユーザー状態を更新できませんでした。",
      },
      { status: 500 }
    );
  }
}
