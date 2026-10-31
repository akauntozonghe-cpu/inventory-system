import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const session = vi.hoisted(() => ({ loggedIn: false, admin: false }));
const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  item: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({
  requireLogin: () => session.loggedIn
    ? { user: { id: "worker" }, response: null }
    : { user: null, response: NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 }) },
  hasAdminAccess: () => session.admin,
  requireAdmin: () => ({ user: null, response: NextResponse.json({ code: "ADMIN_REQUIRED" }, { status: 403 }) }),
}));
import { GET } from "../src/app/api/items/[id]/route";

const request = () => GET(
  new NextRequest("http://localhost/api/items/product"),
  { params: Promise.resolve({ id: "product" }) },
);

beforeEach(() => {
  vi.resetAllMocks();
  session.loggedIn = true;
  session.admin = false;
  db.$transaction.mockImplementation(async fn => fn(db));
  db.item.findUnique.mockResolvedValue({ id: "product", name: "テスト商品", isArchived: false, inventoryInstances: [] });
});

it("never queries item data for unauthenticated requests", async () => {
  session.loggedIn = false;
  expect((await request()).status).toBe(401);
  expect(db.$transaction).not.toHaveBeenCalled();
});

it("hides deleted products from ordinary workers", async () => {
  db.item.findUnique.mockResolvedValue({ id: "product", name: "削除済み", isArchived: true, inventoryInstances: [] });
  expect((await request()).status).toBe(404);
});

it("allows authorized administrators to inspect deleted products", async () => {
  session.admin = true;
  db.item.findUnique.mockResolvedValue({ id: "product", name: "削除済み", isArchived: true, inventoryInstances: [] });
  expect((await request()).status).toBe(200);
});

it("filters individually deleted stock from ordinary item detail", async () => {
  expect((await request()).status).toBe(200);
  const args = db.item.findUnique.mock.calls[0][0];
  expect(args.select.inventoryInstances.where).toEqual({ status: { not: "廃止" } });
});

it("lets authorized administrators inspect deleted stock in item detail", async () => {
  session.admin = true;
  expect((await request()).status).toBe(200);
  const args = db.item.findUnique.mock.calls[0][0];
  expect(args.select.inventoryInstances.where).toBeUndefined();
});
