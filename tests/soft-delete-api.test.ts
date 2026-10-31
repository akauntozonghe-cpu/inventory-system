import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const access = vi.hoisted(() => ({ allowed: true }));
const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  item: { findUnique: vi.fn(), updateMany: vi.fn() },
  inventoryInstance: { findUnique: vi.fn(), updateMany: vi.fn() },
  adminActionLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: () => access.allowed
    ? { user: { id: "administrator", role: "ADMIN" }, response: null }
    : { user: null, response: NextResponse.json({ code: "ADMIN_REQUIRED" }, { status: 403 }) },
  requireLogin: () => ({ user: { id: "administrator" }, response: null }),
  hasAdminAccess: () => access.allowed,
}));

import { DELETE as deleteItem } from "../src/app/api/items/[id]/route";
import { DELETE as deleteStock } from "../src/app/api/inventory/route";

const timestamp = "2026-10-30T00:00:00.000Z";
const itemRequest = () => deleteItem(
  new NextRequest("http://localhost/api/items/item?expectedUpdatedAt=" + encodeURIComponent(timestamp), { method: "DELETE" }),
  { params: Promise.resolve({ id: "item" }) },
);
const stockRequest = () => deleteStock(
  new NextRequest("http://localhost/api/inventory?id=stock&expectedUpdatedAt=" + encodeURIComponent(timestamp), { method: "DELETE" }),
);

beforeEach(() => {
  vi.resetAllMocks();
  access.allowed = true;
  db.$transaction.mockImplementation(async callback => callback(db));
  db.item.findUnique.mockResolvedValue({ id: "item", name: "商品", janCode: "4901234567894", systemBarcode: null, isArchived: false, updatedAt: new Date(timestamp) });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.inventoryInstance.findUnique.mockResolvedValue({
    id: "stock", itemId: "item", status: "在庫中", updatedAt: new Date(timestamp),
    quantity: 3, archivedAt: null, item: { name: "商品", janCode: "4901234567894" },
  });
  db.inventoryInstance.updateMany.mockResolvedValue({ count: 1 });
  db.adminActionLog.create.mockResolvedValue({});
});

it("soft-deletes the item, keeping the database record and writing an audit", async () => {
  const response = await itemRequest();
  expect(response.status).toBe(200);
  expect(db.item.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "item", isArchived: false, updatedAt: new Date(timestamp) },
    data: expect.objectContaining({ isArchived: true }),
  }));
  expect(db.adminActionLog.create.mock.calls[0][0].data.action).toBe("ITEM_SOFT_DELETE");
});

it("soft-deletes an individual stock entry without erasing histories", async () => {
  const response = await stockRequest();
  expect(response.status).toBe(200);
  expect(db.inventoryInstance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "stock", updatedAt: new Date(timestamp), status: { not: "廃止" } },
    data: expect.objectContaining({ status: "廃止", archivedFromStatus: "在庫中" }),
  }));
  expect(db.adminActionLog.create.mock.calls[0][0].data.action).toBe("INVENTORY_SOFT_DELETE");
});

it("rejects unauthorized deletes before accessing the database", async () => {
  access.allowed = false;
  expect((await itemRequest()).status).toBe(403);
  expect((await stockRequest()).status).toBe(403);
  expect(db.$transaction).not.toHaveBeenCalled();
});

it("blocks stale stock updates to prevent silent overwrites", async () => {
  db.inventoryInstance.findUnique.mockResolvedValue({
    id: "stock", itemId: "item", status: "在庫中", updatedAt: new Date("2026-10-31T00:00:00.000Z"),
    quantity: 3, item: { name: "商品", janCode: "4901234567894" },
  });
  expect((await stockRequest()).status).toBe(409);
  expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();
});

it("does not delete an already deleted item again", async () => {
  db.item.findUnique.mockResolvedValue({
    id: "item", name: "商品", janCode: null, systemBarcode: null, isArchived: true, updatedAt: new Date(timestamp),
  });
  expect((await itemRequest()).status).toBe(409);
  expect(db.item.updateMany).not.toHaveBeenCalled();
});
