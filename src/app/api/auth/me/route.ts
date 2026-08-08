import { NextRequest, NextResponse } from "next/server";
import { getLoggedInUser } from "@/lib/auth";

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

  return NextResponse.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });
}