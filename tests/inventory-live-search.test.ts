import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({
  stocktakeSession: { findUnique: vi.fn() },
  inventoryInstance: { findMany: vi.fn() },
  stocktakeTarget: { findMany: vi.fn(), createMany: vi.fn() },
  stocktakeRecord: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ getLoggedInUser: () => ({ id: "worker" }), hasAdminAccess: () => false }));
vi.mock("@/lib/database-retry", () => ({ withDatabaseRetry: (operation: () => unknown) => operation() }));
import { GET } from "../src/app/api/inventory/search/route";

const item = { id: "new-item", janCode: "4901234567890", systemBarcode: null, managementCode: null, managementGroupCode: null, name: "他端末の新商品", majorCategory: "食品", minorCategory: null, manufacturer: null, defaultUnit: "個" };
const inventory = { id: "new-inventory", quantity: 8, item, managementCode: null, managementGroupCode: null, majorCategory: null, minorCategory: null, storageLocation: { id: "shelf", name: "棚A" } };
describe("live stocktake search", () => {
  it("applies a location QR filter inside the existing session target query", async () => {
    await GET(new NextRequest("http://localhost/api/inventory/search?sessionId=session&storageLocationId=shelf&filter=ALL"));
    expect(db.stocktakeTarget.findMany.mock.calls[0][0].where.inventoryInstance.is.AND).toContainEqual({ storageLocationId: "shelf" });
    expect(db.stocktakeTarget.findMany.mock.calls[0][0].where.sessionId).toBe("session");
  });
  it("does not rewrite an already enrolled target during a scan", async () => {
    db.inventoryInstance.findMany.mockResolvedValue([{ ...inventory, stocktakeTargets: [{ sessionId: "session" }] }]);
    const response = await GET(new NextRequest("http://localhost/api/inventory/search?sessionId=session&exact=true&filter=ALL&q=4901234567890"));
    expect((await response.json())[0].id).toBe(inventory.id);
    expect(db.stocktakeTarget.createMany).not.toHaveBeenCalled();
  });
  it("limits database retrieval to the session's classification", async () => {
    db.stocktakeSession.findUnique.mockResolvedValue({ id: "session", operatorUserId: "worker", status: "IN_PROGRESS", scopeType: "MAJOR_CATEGORY", scopeValue: "食品" });
    await GET(new NextRequest("http://localhost/api/inventory/search?sessionId=session&exact=true&filter=ALL&q=4901234567890"));
    expect(db.inventoryInstance.findMany.mock.calls[0][0].where.AND).toEqual([{ item: { is: { majorCategory: "食品" } } }]);
  });
  it("同じJANの別ロットを正常な複数候補として返し、管理No.を混同しない", async () => {
    const lots = [{ ...inventory, id: "lot-a", lotNo: "A" }, { ...inventory, id: "lot-b", lotNo: "B" }];
    db.inventoryInstance.findMany.mockResolvedValue(lots);
    db.stocktakeTarget.findMany.mockResolvedValue(lots.map(row => ({ inventoryInstanceId: row.id, expectedQuantity: 8, inventoryInstance: row })));
    const response = await GET(new NextRequest("http://localhost/api/inventory/search?sessionId=session&exact=true&filter=ALL&q=4901234567890"));
    expect(response.status).toBe(200);
    expect((await response.json()).map((row: { id: string; lotNo: string }) => [row.id, row.lotNo])).toEqual([["lot-a", "A"], ["lot-b", "B"]]);
  });
  it("管理No.で在庫を特定できる", async () => {
    const response = await GET(new NextRequest("http://localhost/api/inventory/search?sessionId=session&exact=true&filter=ALL&q=new-inventory"));
    expect(response.status).toBe(200);
    expect((await response.json()).map((row: { id: string }) => row.id)).toEqual(["new-inventory"]);
  });
  it("選択中の同期では他の全在庫を取得しない", async () => {
    await GET(new NextRequest("http://localhost/api/inventory/search?sessionId=session&inventoryInstanceId=new-inventory&filter=ALL"));
    expect(db.inventoryInstance.findMany.mock.calls[0][0].where.id).toBe("new-inventory");
  });
  beforeEach(() => {
    vi.clearAllMocks();
    db.stocktakeSession.findUnique.mockResolvedValue({ id: "session", operatorUserId: "worker", status: "IN_PROGRESS", scopeType: "ALL", scopeValue: null });
    db.inventoryInstance.findMany.mockResolvedValue([inventory]);
    db.stocktakeTarget.createMany.mockResolvedValue({ count: 1 });
    db.stocktakeTarget.findMany.mockResolvedValue([{ inventoryInstanceId: inventory.id, expectedQuantity: 8, inventoryInstance: inventory }]);
    db.stocktakeRecord.findMany.mockResolvedValue([]);
  });
  it("finds a newly registered JAN without the old 5000/1000 record cutoffs", async () => {
    const response = await GET(new NextRequest("http://localhost/api/inventory/search?sessionId=session&exact=true&filter=ALL&q=４９０１２３４５６７８９０"));
    expect(response.status).toBe(200);
    expect((await response.json())[0].id).toBe("new-inventory");
    expect(db.inventoryInstance.findMany.mock.calls[0][0].take).toBeUndefined();
    const targetQuery = db.stocktakeTarget.findMany.mock.calls[0][0];
    expect(targetQuery.take).toBeUndefined();
    expect(targetQuery.where.inventoryInstance.is.AND).toContainEqual({ id: { in: ["new-inventory"] } });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("enrolls new inventory for keyword/list searches and keeps existing expected counts", async () => {
    await GET(new NextRequest("http://localhost/api/inventory/search?sessionId=session&q=新商品"));
    expect(db.inventoryInstance.findMany.mock.calls[0][0].where.stocktakeTargets).toEqual({ none: { sessionId: "session" } });
    expect(db.stocktakeTarget.createMany).toHaveBeenCalledWith({ data: [{ sessionId: "session", inventoryInstanceId: "new-inventory", expectedQuantity: 8 }], skipDuplicates: true });
  });
  it("does not enroll out-of-scope inventory", async () => {
    db.stocktakeSession.findUnique.mockResolvedValue({ id: "session", operatorUserId: "worker", status: "IN_PROGRESS", scopeType: "LOCATION", scopeValue: "棚B" });
    db.stocktakeTarget.findMany.mockResolvedValue([]);
    const response = await GET(new NextRequest("http://localhost/api/inventory/search?sessionId=session&exact=true&q=4901234567890"));
    expect(await response.json()).toEqual([]);
    expect(db.stocktakeTarget.createMany).not.toHaveBeenCalled();
  });
  it("never changes completed sessions when scanning", async () => {
    db.stocktakeSession.findUnique.mockResolvedValue({ id: "session", operatorUserId: "worker", status: "COMPLETED", scopeType: "ALL", scopeValue: null });
    await GET(new NextRequest("http://localhost/api/inventory/search?sessionId=session&exact=true&q=4901234567890"));
    expect(db.stocktakeTarget.createMany).not.toHaveBeenCalled();
  });
});
