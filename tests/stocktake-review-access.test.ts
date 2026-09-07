import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({
  admin: true,
  db: {
    stocktakeSession: { findUnique: vi.fn(), updateMany: vi.fn() },
    appUser: { findUnique: vi.fn() },
    stocktakeTarget: { findMany: vi.fn(), findUnique: vi.fn() },
    stocktakeRecord: { findMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: state.db }));
vi.mock("@/lib/auth", () => ({ getLoggedInUser: () => ({ id: "viewer" }), hasAdminAccess: () => state.admin }));
import { GET as progress } from "../src/app/api/stocktake/session/[id]/progress/route";
import { GET as result } from "../src/app/api/stocktake/session/[id]/result/route";
import { POST as save } from "../src/app/api/stocktake/record/route";
const date = new Date("2026-09-06T12:00:00Z");
const session = { id: "s", title: "誤って終了した棚卸", operator: "別の担当者", operatorUserId: "another-worker", status: "IN_PROGRESS", startedAt: date, pausedAt: null, completedAt: null, cancelledAt: null };
const params = { params: Promise.resolve({ id: "s" }) };
const getProgress = () => progress(new NextRequest("http://localhost/api/stocktake/session/s/progress"), params);
const getResult = () => result(new NextRequest("http://localhost/api/stocktake/session/s/result"), params);
const saveRecord = () => save(new NextRequest("http://localhost/api/stocktake/record", { method: "POST", body: JSON.stringify({ sessionId: "s", inventoryInstanceId: "i", countedQuantity: 7 }) }));

describe("continued input after review is reopened", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.admin = true;
    state.db.stocktakeSession.findUnique.mockResolvedValue(session);
    state.db.stocktakeSession.updateMany.mockResolvedValue({ count: 1 });
    state.db.appUser.findUnique.mockResolvedValue({ featurePermissions: [] });
    state.db.stocktakeTarget.findMany.mockResolvedValue([{ inventoryInstanceId: "i", expectedQuantity: 5, inventoryInstance: { unit: "個", item: { name: "商品", defaultUnit: "個" }, storageLocation: null } }]);
    state.db.stocktakeTarget.findUnique.mockResolvedValue({ expectedQuantity: 5 });
    state.db.stocktakeRecord.findMany.mockResolvedValue([{ id: "r", inventoryInstanceId: "i", countedQuantity: 7, updatedAt: date }]);
    state.db.stocktakeRecord.upsert.mockResolvedValue({ id: "r", countedQuantity: 7 });
    state.db.$transaction.mockImplementation(operation => operation(state.db));
  });
  it("lets an administrator continue another worker's reopened stocktake in both UI and save API", async () => {
    const response = await getProgress();
    expect(response.status).toBe(200);
    expect((await response.json()).permissions).toMatchObject({ isOperator: false, isAdmin: true, canOperate: true });
    expect((await saveRecord()).status).toBe(200);
    expect(state.db.stocktakeRecord.upsert).toHaveBeenCalledOnce();
  });
  it("rejects an in-flight save if another device ended input before it acquired the session", async () => {
    state.db.stocktakeSession.updateMany.mockResolvedValue({ count: 0 });
    expect((await saveRecord()).status).toBe(409);
    expect(state.db.stocktakeRecord.upsert).not.toHaveBeenCalled();
  });
  it("keeps the original worker able to continue", async () => {
    state.admin = false;
    state.db.stocktakeSession.findUnique.mockResolvedValue({ ...session, operatorUserId: "viewer" });
    expect((await (await getProgress()).json()).permissions.canOperate).toBe(true);
    expect((await saveRecord()).status).toBe(200);
  });
  it("does not grant other ordinary workers access", async () => {
    state.admin = false;
    expect((await getProgress()).status).toBe(403);
    expect((await saveRecord()).status).toBe(403);
    expect(state.db.stocktakeRecord.upsert).not.toHaveBeenCalled();
  });
  it.each(["REVIEW", "PAUSED", "COMPLETED", "CANCELLED", "CONFLICT"])("does not enable input before reopening %s", async status => {
    state.db.stocktakeSession.findUnique.mockResolvedValue({ ...session, status });
    expect((await (await getProgress()).json()).permissions.canOperate).toBe(false);
  });
  it("does not offer a formal confirmation that must fail when review has no saved input", async () => {
    state.db.stocktakeSession.findUnique.mockResolvedValue({ ...session, status: "REVIEW" });
    state.db.stocktakeRecord.findMany.mockResolvedValue([]);
    const data = await (await getResult()).json();
    expect(data.permissions).toMatchObject({ isAdmin: true, canApply: false });
    expect(data.summary.recordedCount).toBe(0);
  });
  it("retains formal confirmation for a valid review with saved input", async () => {
    state.db.stocktakeSession.findUnique.mockResolvedValue({ ...session, status: "REVIEW" });
    const data = await (await getResult()).json();
    expect(data.permissions.canApply).toBe(true);
    expect(data.records[0].countedQuantity).toBe(7);
  });
});
