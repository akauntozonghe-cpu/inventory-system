import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath =
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/setup");

  if (isPublicPath) {
    return NextResponse.next();
  }

  const user = verifySessionToken(
    request.cookies.get(AUTH_COOKIE)?.value
  );

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          code: "AUTH_REQUIRED",
          message: "ログインが必要です。",
        },
        { status: 401 }
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";

    return NextResponse.redirect(loginUrl);
  }

  const isPasswordChangePath =
    pathname === "/account/password" ||
    pathname.startsWith("/api/auth/password") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/auth/me");

  // 初期パスワード・仮パスワードのままでは他の操作を止める
  if (user.mustChangePassword && !isPasswordChangePath) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          code: "PASSWORD_CHANGE_REQUIRED",
          message:
            "初期パスワードの変更が必要です。パスワード変更後に作業を開始してください。",
        },
        { status: 403 }
      );
    }

    const passwordUrl = request.nextUrl.clone();
    passwordUrl.pathname = "/account/password";
    passwordUrl.search = "";

    return NextResponse.redirect(passwordUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};