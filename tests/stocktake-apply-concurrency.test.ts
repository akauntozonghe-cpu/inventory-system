import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({
  stocktakeSession: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  stocktakeRecord: { findMany: vi.fn() },
  stocktakeTarget: { findMany: vi.fn() },
  inventoryInstance: { findMany: vi.fn(), updateMany: vi.fn() },
  inventoryHistory: { create: vi.fn() },
  notification:{create:vi.fn()},
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/device-push",()=>({scheduleDeviceNotifications:vi.fn()}));
vi.mock("@/lib/auth", () => ({ getLoggedInUser: () => ({ id: "worker" }), hasAdminAccess: () => true }));
import { POST } from "../src/app/api/stocktake/session/[id]/apply/route";

describe("stocktake confirmation guards", () => {
  const date = new Date("2026-09-06T00:00:00Z");
  const request = () => POST(new NextRequest("http://localhost/api/stocktake/session/s/apply", { method: "POST" }), { params: Promise.resolve({ id: "s" }) });
  beforeEach(() => {
    vi.clearAllMocks();
    db.stocktakeSession.findUnique.mockResolvedValue({ id: "s", title: "棚卸", status: "REVIEW", operatorUserId: "worker", updatedAt: date });
    db.stocktakeRecord.findMany.mockResolvedValue([{ inventoryInstanceId: "inventory", countedQuantity: 5 }]);
    db.stocktakeTarget.findMany.mockResolvedValue([{inventoryInstanceId:"inventory",expectedQuantity:8}]);
    db.inventoryInstance.findMany.mockResolvedValue([{ id: "inventory", quantity: 8, updatedAt: date }]);
    db.stocktakeSession.updateMany.mockResolvedValue({ count: 1 });
    db.inventoryInstance.updateMany.mockResolvedValue({ count: 1 });
    db.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) => callback(db));
  });
  it("does not resurrect sold stock when the saved count had no discrepancy", async () => {
    db.stocktakeRecord.findMany.mockResolvedValue([{ inventoryInstanceId: "inventory", countedQuantity: 8 }]);
    db.inventoryInstance.findMany.mockResolvedValue([{ id: "inventory", quantity: 0, updatedAt: date }]);
    expect((await request()).status).toBe(200);
    expect(db.inventoryInstance.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantity: 0 }) }));
    expect(db.inventoryHistory.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({changeQuantity:0})}));
  });
  it("does not double apply another worker's discrepancy or overwrite subsequent movements", async () => {
    db.inventoryInstance.findMany.mockResolvedValue([{ id: "inventory", quantity: 5, updatedAt: date }]);
    const response = await request();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("STOCKTAKE_APPLY_MOVEMENT_RECHECK");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("reconfirms an unchanged reopened session without rolling back later stock movements", async () => {
    db.stocktakeSession.findUnique.mockResolvedValue({ id: "s", title: "棚卸", status: "REVIEW", operatorUserId: "worker", updatedAt: date, completedAt: date });
    db.stocktakeRecord.findMany.mockResolvedValue([{ inventoryInstanceId: "inventory", countedQuantity: 5, updatedAt: new Date(date.getTime() - 1000) }]);
    const response = await request();
    expect(response.status).toBe(200);
    expect(db.notification.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({recipientUserId:"worker",stocktakeSessionId:"s",type:"STOCKTAKE_COMPLETED"})}));
    expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();
    expect(db.inventoryHistory.create).not.toHaveBeenCalled();
  });
  it("applies only newly changed records when confirming a reopened completed session", async () => {
    db.stocktakeSession.findUnique.mockResolvedValue({ id: "s", title: "棚卸", status: "REVIEW", operatorUserId: "worker", updatedAt: date, completedAt: date });
    db.stocktakeRecord.findMany.mockResolvedValue([{ inventoryInstanceId: "untouched", countedQuantity: 2, updatedAt: new Date(date.getTime() - 1000) }, { inventoryInstanceId: "inventory", countedQuantity: 5, updatedAt: new Date(date.getTime() + 1000) }]);
    expect((await request()).status).toBe(200);
    expect(db.inventoryInstance.findMany.mock.calls[0][0].where.id.in).toEqual(["inventory"]);
    expect(db.inventoryInstance.updateMany).toHaveBeenCalledOnce();
  });
  it("does not write inventory or history if another device already claimed the session", async () => {
    db.stocktakeSession.updateMany.mockResolvedValue({ count: 0 });
    const response = await request();
    expect(response.status).toBe(409);
    expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();
    expect(db.inventoryHistory.create).not.toHaveBeenCalled();
  });
  it("throws inside the transaction when the inventory version has changed", async () => {
    db.inventoryInstance.updateMany.mockResolvedValue({ count: 0 });
    const response = await request();
    expect(response.status).toBe(409);
    expect(db.inventoryHistory.create).not.toHaveBeenCalled();
  });
  it("updates inventory with a version check before reporting success", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(db.inventoryInstance.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inventory", updatedAt: date }, data: expect.objectContaining({ quantity: 5, actualQuantity: 5 }) }));
    expect(db.inventoryHistory.create).toHaveBeenCalledOnce();
    expect(db.stocktakeSession.updateMany.mock.calls[0][0].where).toEqual({ id: "s", status: "REVIEW", updatedAt: date });
  });
  it("does not apply a record without a target in this worker's session",async()=>{db.stocktakeTarget.findMany.mockResolvedValue([]);expect((await request()).status).toBe(409);expect(db.stocktakeTarget.findMany.mock.calls[0][0].where).toMatchObject({sessionId:"s"});expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();});
});
