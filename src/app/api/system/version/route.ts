import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Minimal release provenance for support and production smoke checks.
 * Do not return environment contents, secrets, database details or user data.
 */
export async function GET(request: NextRequest) {
  const auth = requireLogin(request);
  if (auth.response) return auth.response;

  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_SHA ?? null;
  const response = NextResponse.json({
    application: "Inventory OS",
    commitSha: sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha : null,
    environment: process.env.VERCEL_ENV ?? "unknown",
    versionKnown: Boolean(sha && /^[0-9a-f]{7,40}$/i.test(sha)),
  });
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}
