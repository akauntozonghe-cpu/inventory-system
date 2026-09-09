vi.mock("@/lib/stocktake-presence", () => ({ expireStocktakePresence: async () => {} }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ admin: true, findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { stocktakeSession: { findMany: state.findMany } } }));
vi.mock("@/lib/auth", () => ({ getLoggedInUser: () => ({ id: "worker" }), hasAdminAccess: () => state.admin }));
import { GET } from "../src/app/api/stocktake/session/route";
describe("one session-list response for history and management", () => {
  beforeEach(() => { state.admin = true; vi.clearAllMocks(); state.findMany.mockResolvedValue([]); });
  it("supplies the administrator flag required to show recovery actions in history", async () => {
    const response = await GET(new NextRequest("http://localhost/api/stocktake/session?all=true"));
    expect(await response.json()).toMatchObject({ isAdmin: true, scope: "ALL", sessions: [] });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("retains admin capabilities while showing only their own sessions", async () => {
    const response = await GET(new NextRequest("http://localhost/api/stocktake/session?all=false"));
    expect(await response.json()).toMatchObject({ isAdmin: true, scope: "MINE" });
    expect(state.findMany.mock.calls[0][0].where.operatorUserId).toBe("worker");
  });
  it("never grants an ordinary worker access to all sessions through the query string", async () => {
    state.admin = false;
    const response = await GET(new NextRequest("http://localhost/api/stocktake/session?all=true"));
    expect(await response.json()).toMatchObject({ isAdmin: false, scope: "MINE" });
    expect(state.findMany.mock.calls[0][0].where.operatorUserId).toBe("worker");
  });
});
