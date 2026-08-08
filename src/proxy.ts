import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ログインと初回管理者登録は未ログインでも開ける
  if (
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/auth/setup")
  ) {
    return NextResponse.next();
  }

  const user = verifySessionToken(
    request.cookies.get(AUTH_COOKIE)?.value
  );

  if (user) {
    return NextResponse.next();
  }

  // APIはJSONエラーを返す
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { message: "ログインが必要です。" },
      { status: 401 }
    );
  }

  // 画面は必ずログインへ
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};