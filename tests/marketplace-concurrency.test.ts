import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({
  marketplaceListing: { findUnique: vi.fn(), aggregate: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  inventoryInstance: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  inventoryHistory: { create: vi.fn() }, inventoryEvent: { create: vi.fn() }, notification: { create: vi.fn() }, adminActionLog: { create: vi.fn() }, $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ requireLogin: () => ({ user: { id: "worker" }, response: null }) }));
import { POST, PATCH } from "../src/app/api/admin/marketplace/listings/route";
const inventory = { id: "inv", quantity: 5, actualQuantity: null, updatedAt: new Date(0), item: { name: "商品", isArchived: false } };
beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async callback => callback(db));
  db.marketplaceListing.findUnique.mockResolvedValue({ id: "listing", status: "LISTED", updatedAt: new Date(0), listedQuantity: 2, inventoryInstanceId: "inv", inventoryInstance: inventory });
  db.marketplaceListing.updateMany.mockResolvedValue({ count: 1 });
  db.inventoryInstance.updateMany.mockResolvedValue({ count: 1 });
  db.inventoryInstance.findUnique.mockResolvedValue(inventory);
  db.marketplaceListing.aggregate.mockResolvedValue({ _sum: { listedQuantity: 4 } });
});
const request = (body: object) => new NextRequest("http://localhost/api/admin/marketplace/listings", { method: "PATCH", body: JSON.stringify(body) });
it("does not subtract inventory when a competing terminal already claimed the listing", async () => {
  db.marketplaceListing.updateMany.mockResolvedValue({ count: 0 });
  const response = await PATCH(request({ id: "listing", status: "SOLD" }));
  expect(response?.status).toBe(409);
  expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();
  expect(db.inventoryHistory.create).not.toHaveBeenCalled();
});
it("does not create a sales history after inventory changed", async () => {
  db.inventoryInstance.updateMany.mockResolvedValue({ count: 0 });
  expect((await PATCH(request({ id: "listing", status: "SOLD" })))?.status).toBe(409);
  expect(db.inventoryHistory.create).not.toHaveBeenCalled();
});
it("rejects sales above the listing quantity", async () => {
  expect((await PATCH(request({ id: "listing", status: "SOLD", soldQuantity: 3 })))?.status).toBe(409);
  expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();
});
it("checks reservations inside a serializable creation transaction", async () => {
  expect((await POST(request({ inventoryInstanceId: "inv", price: 100, listedQuantity: 2 })))?.status).toBe(409);
  expect(db.$transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: "Serializable" });
  expect(db.marketplaceListing.create).not.toHaveBeenCalled();
});
it("does not ship an unsold listing", async () => {
  expect((await PATCH(request({ id: "listing", action: "UPDATE_SHIPPING", shippingStatus: "SHIPPED" })))?.status).toBe(409);
  expect(db.marketplaceListing.update).not.toHaveBeenCalled();
});
it("does not allow a draft to skip straight to a sale", async () => {
  db.marketplaceListing.findUnique.mockResolvedValue({ id:"listing",status:"DRAFT",updatedAt:new Date(0),inventoryInstance:inventory });
  expect((await PATCH(request({id:"listing",status:"SOLD"})))?.status).toBe(409);
  expect(db.$transaction).not.toHaveBeenCalled();
});
it("does not allow ordinary shipping updates to reverse a completed shipment",async()=>{
  db.marketplaceListing.findUnique.mockResolvedValue({id:"listing",status:"SOLD",shippingStatus:"SHIPPED",updatedAt:new Date(0),inventoryInstance:inventory});
  expect((await PATCH(request({id:"listing",action:"UPDATE_SHIPPING",shippingStatus:"PACKING"})))?.status).toBe(409);
  expect(db.marketplaceListing.update).not.toHaveBeenCalled();
});
