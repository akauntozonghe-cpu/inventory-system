import { NextRequest, NextResponse } from "next/server";
import { getLoggedInUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "AUTH_ME_UNAUTHORIZED",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  const liveUser = await prisma.appUser.findUnique({
    where: { id: user.id },
    select: { isActive: true, role: true, featurePermissions: true },
  });

  if (!liveUser?.isActive) {
    return NextResponse.json(
      { code: "AUTH_ME_USER_DISABLED", message: "このユーザーは停止されています。" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: liveUser.role,
    mustChangePassword: user.mustChangePassword,
    featurePermissions: liveUser.featurePermissions,
  });
}
