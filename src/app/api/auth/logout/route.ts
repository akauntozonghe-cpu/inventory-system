import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionHash } from "@/lib/device-push";
import { NextResponse } from "next/server";
import {
  ADMIN_ELEVATION_COOKIE,
  AUTH_COOKIE,
  adminElevationCookieOptions,
  sessionCookieOptions,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (token) await prisma.devicePushSubscription.deleteMany({ where: { sessionHash: sessionHash(token) } }).catch(() => {});
  const response = NextResponse.json({ message: "ログアウトしました。" });
  response.cookies.set(AUTH_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  response.cookies.set(ADMIN_ELEVATION_COOKIE, "", { ...adminElevationCookieOptions, maxAge: 0 });
  return response;
}
