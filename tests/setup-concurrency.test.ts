import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({ appUser: { count: vi.fn(), create: vi.fn() }, $transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ hashPassword: async () => "test-hash" }));
import { POST } from "../src/app/api/auth/setup/route";
it("does not create a second initial administrator after another request wins", async () => {
  db.appUser.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
  db.$transaction.mockImplementation(async callback => callback(db));
  const response = await POST(new NextRequest("http://localhost/api/auth/setup", { method: "POST", body: JSON.stringify({ username: "admin2", displayName: "管理者", password: "1234567890a" }) }));
  expect(response.status).toBe(409);
  expect(db.appUser.create).not.toHaveBeenCalled();
  expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
});
