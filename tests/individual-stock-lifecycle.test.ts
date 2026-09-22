import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const state = vi.hoisted(() => ({ admin: true }));
const db = vi.hoisted(() => ({
  $transaction: vi.fn(), inventoryInstance: { findUnique: vi.fn(), updateMany: vi.fn() },
  stocktakeTarget: { count: vi.fn() }, marketplaceListing: { count: vi.fn() }, adminActionLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ requireAdmin: () => state.admin ? { user: { id: "admin" } } : { response: NextResponse.json({}, { status: 403 }) } }));
import { PATCH } from "../src/app/api/inventory/[id]/lifecycle/route";
import { isInspectionTarget } from "../src/lib/product-scope";
const date = new Date("2026-09-23T01:00:00Z");
const stock = { id: "lot-a", itemId: "shared-jan", item: { name: "商品", isArchived: false, inspectionExcluded: false }, updatedAt: date, status: "保管中", lotNo: "A", expirationDate: "2027-01", majorCategory: "店頭", minorCategory: "備品", storageLocationId: "shelf-a", quantity: 5, inspectionExcluded: null, archivedFromStatus: null, archivedAt: null };
const request = (operation: string) => PATCH(new NextRequest("http://localhost/api/inventory/lot-a/lifecycle", { method: "PATCH", body: JSON.stringify({ operation, expectedUpdatedAt: date.toISOString(), reason: "現物を確認しました" }) }), { params: Promise.resolve({ id: "lot-a" }) });
beforeEach(() => {
  vi.resetAllMocks(); state.admin = true;
  db.$transaction.mockImplementation(fn => fn(db));
  db.inventoryInstance.findUnique.mockResolvedValue(stock);
  db.inventoryInstance.updateMany.mockResolvedValue({ count: 1 });
  db.stocktakeTarget.count.mockResolvedValue(0); db.marketplaceListing.count.mockResolvedValue(0);
});
it("archives only the selected stock ID and preserves its quantity and sibling lots", async () => {
  expect((await request("ARCHIVE"))?.status).toBe(200);
  expect(db.inventoryInstance.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "lot-a", updatedAt: date }, data: { status: "廃止", archivedFromStatus: "保管中" } });
  expect(db.inventoryInstance.updateMany.mock.calls[0][0].data).not.toHaveProperty("quantity");
  expect(db.stocktakeTarget.count.mock.calls[0][0].where.inventoryInstanceId).toBe("lot-a");
  expect(db.marketplaceListing.count.mock.calls[0][0].where.inventoryInstanceId).toBe("lot-a");
  expect(db.adminActionLog.create.mock.calls[0][0].data.detail).toMatchObject({ inventoryInstanceId: "lot-a", lotNo: "A", expirationDate: "2027-01", majorCategory: "店頭" });
});
it("restores the selected lot's original state", async () => {
  db.inventoryInstance.findUnique.mockResolvedValue({ ...stock, status: "廃止", archivedFromStatus: "保管中" });
  expect((await request("RESTORE"))?.status).toBe(200);
  expect(db.inventoryInstance.updateMany.mock.calls[0][0].data.status).toBe("保管中");
});
it.each(["EXCLUDE_INSPECTION", "INCLUDE_INSPECTION"])("sets %s only on the selected stock", async operation => {
  expect((await request(operation))?.status).toBe(200);
  expect(db.inventoryInstance.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "lot-a" }, data: { inspectionExcluded: operation === "EXCLUDE_INSPECTION" } });
  expect(db.inventoryInstance.updateMany.mock.calls[0][0].data).not.toHaveProperty("status");
});
it("allows one lot's inspection setting to differ from the JAN group", () => {
  expect(isInspectionTarget({ inspectionExcluded: false }, "保管中", true)).toBe(false);
  expect(isInspectionTarget({ inspectionExcluded: false }, "保管中", null)).toBe(true);
  expect(isInspectionTarget({ inspectionExcluded: true }, "保管中", false)).toBe(true);
  expect(isInspectionTarget({ inspectionExcluded: true }, "保管中", null)).toBe(false);
  expect(isInspectionTarget({}, "廃止", false)).toBe(false);
});
it.each(["stocktakeTarget", "marketplaceListing"] as const)("rejects archive while the selected stock has active %s", async table => {
  db[table].count.mockResolvedValue(1);
  expect((await request("ARCHIVE"))?.status).toBe(409);
  expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();
});
it("rejects stale data and revoked administrator permission", async () => {
  db.inventoryInstance.findUnique.mockResolvedValue({ ...stock, updatedAt: new Date("2026-09-23T02:00:00Z") });
  expect((await request("ARCHIVE"))?.status).toBe(409);
  state.admin = false;
  expect((await request("ARCHIVE"))?.status).toBe(403);
  expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();
});
it("rolls back when its audit cannot be saved", async () => {
  db.adminActionLog.create.mockRejectedValue(new Error("audit unavailable"));
  expect((await request("ARCHIVE"))?.status).toBe(409);
  expect(db.$transaction.mock.calls[0][1].isolationLevel).toBe("Serializable");
});
