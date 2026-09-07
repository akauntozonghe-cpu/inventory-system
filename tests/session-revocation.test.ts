import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ user: { id: "u", role: "ADMIN", mustChangePassword: false }, elevation: null as null | { adminUserId: string; authenticatedByUserId: string }, find: vi.fn() }));
vi.mock("@/lib/auth", () => ({ AUTH_COOKIE: "session", ADMIN_ELEVATION_COOKIE: "elevation", verifySessionToken: () => state.user, getAdminElevation: () => state.elevation, hasAdminAccess: () => true }));
vi.mock("@/lib/prisma", () => ({ prisma: { appUser: { findUnique: state.find } } }));
import { proxy } from "../src/proxy";
beforeEach(() => { state.find.mockReset(); state.elevation = null; });
it("rejects an old administrator session after demotion", async () => {
  state.find.mockResolvedValue({ isActive: true, role: "WORKER", mustChangePassword: false });
  const result = await proxy(new NextRequest("http://localhost/api/items", { method: "POST" }));
  expect(result.status).toBe(401);
  expect((await result.json()).code).toBe("AUTH_SESSION_CHANGED");
});
it("revokes elevation when the approving administrator is disabled", async () => {
  state.elevation = { adminUserId: "sponsor", authenticatedByUserId: "u" };
  state.find.mockResolvedValueOnce({ isActive: true, role: "ADMIN", mustChangePassword: false }).mockResolvedValueOnce({ isActive: false, role: "ADMIN" });
  const result = await proxy(new NextRequest("http://localhost/api/items", { method: "POST" }));
  expect(result.status).toBe(403);
  expect((await result.json()).code).toBe("ADMIN_ELEVATION_REVOKED");
});
