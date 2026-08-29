import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  hasAdminAccess,
  verifySessionToken,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requiredFeature } from "@/lib/feature-permissions";

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
    pathname.startsWith("/admin/maintenance-recovery") ||
    pathname.startsWith("/admin/users") ||
    pathname.startsWith("/admin/error-reports") ||
    pathname.startsWith("/admin/marketplace") ||
    pathname.startsWith("/admin/category-qr") ||
    pathname.startsWith("/api/users") ||
    pathname.startsWith("/api/admin/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { method } = request;

  const isPublicPath =
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname === "/maintenance" ||
    pathname === "/api/system-status" ||
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

  const liveUser = await prisma.appUser.findUnique({
    where: { id: user.id },
    select: { isActive: true, role: true, featurePermissions: true },
  });

  if (!liveUser?.isActive) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { code: "USER_DISABLED", message: "このユーザーは停止されています。" },
        { status: 401 }
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(AUTH_COOKIE);
    return response;
  }

  const operationSetting = await prisma.systemOperationSetting.findUnique({
    where: { id: "system" },
    select: { mode: true, message: true },
  });
  const testMutationAllowed =
    pathname === "/api/admin/test-mode/run" ||
    pathname === "/api/admin/operation-mode" ||
    pathname.startsWith("/api/auth/logout") ||
    pathname === "/admin/re-auth";
  if (
    operationSetting?.mode === "TEST" &&
    isMutation(method) &&
    !testMutationAllowed
  ) {
    return NextResponse.json(
      {
        code: "SYSTEM_TEST_MODE_WRITE_BLOCKED",
        message: "テストモード中は本番データを更新しません。管理者画面の隔離テストを使用してください。",
      },
      { status: 409 }
    );
  }
  if (operationSetting?.mode === "MAINTENANCE") {
    const adminRecoveryPage =
      pathname === "/admin/maintenance-recovery" ||
      pathname.startsWith("/admin/operation-mode") ||
      pathname.startsWith("/admin/system-check") ||
      pathname.startsWith("/admin/error-reports") ||
      pathname === "/admin/re-auth";
    const adminRecoveryApi =
      pathname === "/api/admin/operation-mode" ||
      pathname.startsWith("/api/admin/system-check") ||
      pathname.startsWith("/api/admin/error-reports") ||
      pathname.startsWith("/api/error-reports") ||
      pathname === "/admin/re-auth";
    const sessionApi =
      pathname.startsWith("/api/auth/logout") ||
      pathname.startsWith("/api/auth/me");

    if (pathname.startsWith("/api/") && !(sessionApi || (liveUser.role === "ADMIN" && adminRecoveryApi))) {
      return NextResponse.json(
        { code: "SYSTEM_MAINTENANCE_503", message: operationSetting.message || "現在メンテナンス中のため、通常機能を停止しています。" },
        { status: 503, headers: { "Retry-After": "60" } }
      );
    }
    if (!pathname.startsWith("/api/") && !(liveUser.role === "ADMIN" && adminRecoveryPage)) {
      const maintenanceUrl = request.nextUrl.clone();
      maintenanceUrl.pathname = liveUser.role === "ADMIN" ? "/admin/maintenance-recovery" : "/maintenance";
      maintenanceUrl.search = "";
      return NextResponse.redirect(maintenanceUrl);
    }
  }

  const feature = requiredFeature(
    pathname,
    method,
    request.nextUrl.searchParams.has("sessionId")
  );
  if (
    liveUser.role !== "ADMIN" &&
    feature &&
    !liveUser.featurePermissions.includes(feature as never)
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          code: `FEATURE_${feature}_DISABLED`,
          message: "この機能は管理者によって利用停止されています。",
        },
        { status: 403 }
      );
    }
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.searchParams.set("permission", feature);
    return NextResponse.redirect(homeUrl);
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
    liveUser.role !== "ADMIN"
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
