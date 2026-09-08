import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ user: { id: "u", role: "ADMIN", mustChangePassword: false }, elevation: null as null | { adminUserId: string; authenticatedByUserId: string }, find: vi.fn() }));
vi.mock("@/lib/auth", () => ({ AUTH_COOKIE: "session", ADMIN_ELEVATION_COOKIE: "elevation", verifySessionToken: () => state.user, getAdminElevation: () => state.elevation, hasAdminAccess: () => state.user.role === "ADMIN" || state.elevation?.authenticatedByUserId === "u" }));
vi.mock("@/lib/prisma", () => ({ prisma: { appUser: { findUnique: state.find }, systemOperationSetting: {findUnique: async()=>({mode:"NORMAL"})} } }));
import { proxy } from "../src/proxy";
beforeEach(() => { state.find.mockReset(); state.elevation = null; state.user.role="ADMIN"; });
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

function worker(elevated=true){state.user.role="WORKER";state.elevation=elevated?{adminUserId:"sponsor",authenticatedByUserId:"u"}:null;state.find.mockImplementation(async({where})=>({isActive:true,role:where.id==="u"?"WORKER":"ADMIN",mustChangePassword:false,featurePermissions:[]}));}
it("allows authenticated page recovery without granting user administration",async()=>{worker();expect((await proxy(new NextRequest("http://localhost/api/admin/system-check/reports?route=/marketplace"))).status).toBe(200);expect((await proxy(new NextRequest("http://localhost/api/users"))).status).toBe(403);});
it("does not expose recovery to an unauthenticated worker",async()=>{worker(false);expect((await proxy(new NextRequest("http://localhost/api/admin/system-check"))).status).toBe(403);});
it("does not grant recovery access after the sponsor loses administrator status",async()=>{worker();state.find.mockResolvedValue({isActive:true,role:"WORKER",mustChangePassword:false,featurePermissions:[]});expect((await proxy(new NextRequest("http://localhost/api/admin/system-check"))).status).toBe(403);});
