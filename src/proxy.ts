import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  hasAdminAccess,
  verifySessionToken,
} from "@/lib/auth";

function isMutation(method: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

function isAdminOnlyMutation(
  pathname: string,
  method: string
) {
  if (!isMutation(method)) {
    return false;
  }

  const adminRoutes = [
    "/api/items/register",
    "/api/items/system-barcode",
    "/api/inventory/update",
    "/api/import",
    "/api/reset",
    "/api/stocktake/register-item",
  ];

  if (adminRoutes.some((route) => pathname === route)) {
    return true;
  }

  if (
    pathname === "/api/items" ||
    /^\/api\/items\/[^/]+$/.test(pathname)
  ) {
    return true;
  }

  if (pathname === "/api/inventory") {
    return true;
  }

  if (pathname === "/api/storage-locations") {
    return true;
  }

  if (
    /^\/api\/stocktake\/session\/[^/]+\/apply$/.test(
      pathname
    )
  ) {
    return true;
  }

  return false;
}

function isSystemAdminRoute(pathname: string) {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/users") ||
    pathname.startsWith("/admin/error-reports") ||
    pathname.startsWith("/admin/category-qr") ||
    pathname.startsWith("/api/users") ||
    pathname.startsWith("/api/admin/")
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { method } = request;

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

  // 管理者メニュー・ユーザー管理・エラーレポートは、
  // 管理者アカウントだけが直接開ける。
  if (
    isSystemAdminRoute(pathname) &&
    user.role !== "ADMIN"
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          code: "SYSTEM_ADMIN_REQUIRED",
          message:
            "この管理機能は管理者アカウントのみ利用できます。",
        },
        { status: 403 }
      );
    }

    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";

    return NextResponse.redirect(homeUrl);
  }

  // 商品・在庫・取込・初期化などの更新は、
  // 管理者本人、または棚卸画面で一時管理者認証済みの場合だけ許可。
  if (
    isAdminOnlyMutation(pathname, method) &&
    !hasAdminAccess(request)
  ) {
    return NextResponse.json(
      {
        code: "ADMIN_ELEVATION_REQUIRED",
        message:
          "この操作には管理者認証が必要です。管理者モードを有効にしてください。",
      },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};