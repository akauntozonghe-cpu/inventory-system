import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AUTH_COOKIE, createSessionToken } from "../src/lib/auth";
import { FEATURE_KEYS } from "../src/lib/feature-permissions";
import { canUseFeature, canVisit } from "../src/lib/app-access";

const db = vi.hoisted(() => ({ appUser: { findUnique: vi.fn() }, systemOperationSetting: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { proxy } from "../src/proxy";
import { requireEditAccess } from "../src/lib/edit-access";
const oldSecret = process.env.AUTH_SECRET;
const user = { id: "worker", username: "worker", displayName: "担当者", role: "WORKER" as const, mustChangePassword: false, featurePermissions: [...FEATURE_KEYS] };
const request = (path: string, method = "POST") => new NextRequest(`http://localhost${path}`, { method, headers: { cookie: `${AUTH_COOKIE}=${createSessionToken(user)}` } });
beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SECRET = "delegated-work-test-secret-1234567890";
  db.appUser.findUnique.mockResolvedValue({ ...user, isActive: true });
  db.systemOperationSetting.findUnique.mockResolvedValue({ mode: "NORMAL" });
});
afterEach(() => { if (oldSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = oldSecret; });

it.each([
  ["/api/users/person", "PATCH"], ["/api/users", "POST"],
  ["/api/admin/registration-requests", "PATCH"],
  ["/api/admin/operation-mode", "POST"],
  ["/api/admin/system-check/remediate", "POST"],
  ["/api/items/bulk", "POST"], ["/api/items/item", "DELETE"],
  ["/api/reset", "POST"], ["/api/import", "POST"],
  ["/api/stocktake/session/session/apply", "POST"],
])("all daily grants still deny administrator operation %s %s", async (path, method) => {
  expect((await proxy(request(path, method))).status).toBe(403);
});

it.each(["ITEM_EDIT", "INVENTORY_EDIT"] as const)("allows assigned %s without elevating the worker to administrator", async feature => {
  const access = await requireEditAccess(request("/api/test"), feature);
  expect(access.response).toBeNull();
  expect(access.authorization).toMatchObject({ mode: "ASSIGNED_PERMISSION", feature });
  expect(access.user?.role).toBe("WORKER");
});

it("revokes an open editor on the next save even though its login token still has all grants", async () => {
  db.appUser.findUnique.mockResolvedValue({ ...user, isActive: true, featurePermissions: ["STOCKTAKE", "CATALOG"] });
  expect((await requireEditAccess(request("/api/test"), "ITEM_EDIT")).response?.status).toBe(403);
  expect((await requireEditAccess(request("/api/test"), "INVENTORY_EDIT")).response?.status).toBe(403);
});

it("keeps product and stock editing independent and admin navigation unavailable", () => {
  const editor = { ...user, featurePermissions: ["STOCKTAKE", "CATALOG", "INVENTORY_EDIT"] };
  expect(canUseFeature(editor, "INVENTORY_EDIT")).toBe(true);
  expect(canUseFeature(editor, "ITEM_EDIT")).toBe(false);
  for (const path of ["/admin/users", "/admin/recovery", "/import", "/reset"]) expect(canVisit(user, path)).toBe(false);
});
