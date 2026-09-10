import {notificationReturnPath} from "@/lib/page-flow";
import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  ADMIN_ELEVATION_COOKIE,
  getAdminElevation,
  hasAdminAccess,
  verifySessionToken,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requiredFeatures } from "@/lib/feature-permissions";

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
  // フリマはホームから全ユーザーが利用する通常機能。
  // 既存URLとの互換性のため /admin 配下のURLは維持する。
  if (
    pathname.startsWith("/admin/marketplace") ||
    pathname.startsWith("/api/admin/marketplace")
  ) {
    return false;
  }

  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/recovery") ||
    pathname.startsWith("/admin/maintenance-recovery") ||
    pathname.startsWith("/admin/users") ||
    pathname.startsWith("/admin/error-reports") ||
    pathname.startsWith("/admin/category-qr") ||
    pathname.startsWith("/admin/classifications") ||
    pathname.startsWith("/api/users") ||
    pathname.startsWith("/api/admin/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { method } = request;

  // This endpoint authenticates the scheduler with a separate server secret.
  if (pathname === "/api/internal/device-notifications") return NextResponse.next();
  const isPublicPath =
    pathname === "/login" ||
    pathname === "/install" ||
    pathname === "/setup" ||
    pathname === "/maintenance" ||
    pathname === "/offline" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/pwa-icon.svg" ||
    pathname === "/pwa-maskable.svg" ||
    pathname.startsWith("/pwa/icon-") ||
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
    if(notificationReturnPath(pathname)!=="/")loginUrl.searchParams.set("returnTo",pathname);

    return NextResponse.redirect(loginUrl);
  }

  const liveUser = await prisma.appUser.findUnique({
    where: { id: user.id },
    select: { isActive: true, role: true, featurePermissions: true, mustChangePassword: true },
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
    if(notificationReturnPath(pathname)!=="/")loginUrl.searchParams.set("returnTo",pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(AUTH_COOKIE);
    return response;
  }

  if (user.role !== liveUser.role || user.mustChangePassword !== liveUser.mustChangePassword) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ code: "AUTH_SESSION_CHANGED", message: "権限・認証設定が変更されました。ログインし直してください。" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(AUTH_COOKIE); response.cookies.delete(ADMIN_ELEVATION_COOKIE);
    return response;
  }
  const elevation = getAdminElevation(request);
  if (elevation && !(pathname === "/admin/re-auth" && ["POST","DELETE"].includes(method))) {
    const sponsor = await prisma.appUser.findUnique({ where: { id: elevation.adminUserId }, select: { isActive: true, role: true } });
    if (!sponsor?.isActive || sponsor.role !== "ADMIN" || elevation.authenticatedByUserId !== user.id) {
      const response = NextResponse.json({ code: "ADMIN_ELEVATION_REVOKED", message: "一時管理者認証が無効になりました。必要な操作では再認証してください。" }, { status: 403 });
      response.cookies.delete(ADMIN_ELEVATION_COOKIE); return response;
    }
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
      pathname === "/admin/recovery" ||
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

  const feature = requiredFeatures(
    pathname,
    method,
    request.nextUrl.searchParams.has("sessionId")
  ).find(key=>!liveUser.featurePermissions.includes(key as never));
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
    liveUser.role !== "ADMIN" &&
    !((pathname === "/api/admin/system-check" || pathname.startsWith("/api/admin/system-check/")) && hasAdminAccess(request))
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
