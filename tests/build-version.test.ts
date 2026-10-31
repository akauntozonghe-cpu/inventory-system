import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const auth = vi.hoisted(() => ({ loggedIn: false }));
vi.mock("@/lib/auth", () => ({
  requireLogin: () => auth.loggedIn
    ? { user: { id: "worker" }, response: null }
    : { user: null, response: NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 }) },
}));

import { GET } from "../src/app/api/system/version/route";
const originalSha = process.env.VERCEL_GIT_COMMIT_SHA;
const request = () => GET(new NextRequest("http://localhost/api/system/version"));

beforeEach(() => { auth.loggedIn = false; });
afterEach(() => {
  if (originalSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = originalSha;
});

it("never serves release metadata anonymously", async () => {
  expect((await request()).status).toBe(401);
});

it("serves only safe release metadata with no-cache", async () => {
  auth.loggedIn = true;
  process.env.VERCEL_GIT_COMMIT_SHA = "0123456789abcdef0123456789abcdef01234567";
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toMatchObject({
    application: "Inventory OS",
    commitSha: "0123456789abcdef0123456789abcdef01234567",
    versionKnown: true,
  });
});
