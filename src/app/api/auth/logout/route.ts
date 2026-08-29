import { NextResponse } from "next/server";
import {
  ADMIN_ELEVATION_COOKIE,
  AUTH_COOKIE,
  adminElevationCookieOptions,
  sessionCookieOptions,
} from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ message: "ログアウトしました。" });
  response.cookies.set(AUTH_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  response.cookies.set(ADMIN_ELEVATION_COOKIE, "", { ...adminElevationCookieOptions, maxAge: 0 });
  return response;
}
