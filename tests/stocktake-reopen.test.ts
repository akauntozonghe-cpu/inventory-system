import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mock = vi.hoisted(() => ({
  admin: true,
  db: { stocktakePresence: { create: vi.fn() }, stocktakeSession: { findUnique: vi.fn(), updateMany: vi.fn() }, stocktakeRecord: { findMany: vi.fn() }, adminActionLog: { create: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mock.db }));
vi.mock("@/lib/auth", () => ({ requireAdmin: () => mock.admin ? { user: { id: "admin" } } : { response: NextResponse.json({ message: "管理者のみ" }, { status: 403 }) } }));
import { POST } from "../src/app/api/stocktake/session/[id]/reopen/route";
const date = new Date("2026-09-06T12:00:00Z");
const request = (reason = "数量を確認し直す") => POST(new NextRequest("http://localhost/api/stocktake/session/s/reopen", { method: "POST", body: JSON.stringify({ reason }) }), { params: Promise.resolve({ id: "s" }) });
describe("administrator reopens a finished stocktake", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mock.admin = true;
    mock.db.stocktakeSession.findUnique.mockResolvedValue({ id: "s", title: "棚卸", status: "REVIEW", updatedAt: date });
    mock.db.stocktakeSession.updateMany.mockResolvedValue({ count: 1 });
    mock.db.stocktakeRecord.findMany.mockResolvedValue([]);
    mock.db.$transaction.mockImplementation(operation => operation(mock.db));
  });
  it("rejects a worker before reading or writing the database", async () => {
    mock.admin = false;
    expect((await request()).status).toBe(403);
    expect(mock.db.$transaction).not.toHaveBeenCalled();
  });
  it.each(["", " ", "あ".repeat(301)])("requires a valid reopening reason", async reason => {
    expect((await request(reason)).status).toBe(400);
    expect(mock.db.$transaction).not.toHaveBeenCalled();
  });
  it("reopens review while preserving records, targets and the operator", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(mock.db.stocktakePresence.create).toHaveBeenCalledWith({data:{sessionId:"s",deviceId:expect.stringMatching(/^starting-/),userId:"admin",expiresAt:expect.any(Date)}});
    expect(mock.db.stocktakeSession.updateMany).toHaveBeenCalledWith({ where: { id: "s", status: "REVIEW", updatedAt: date }, data: { status: "IN_PROGRESS", pausedAt: null } });
    expect(mock.db.adminActionLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ adminUserId: "admin", action: "STOCKTAKE_REOPEN", detail: expect.objectContaining({ reason: "数量を確認し直す", recordsPreserved: true }) }) }));
  });
  it.each(["IN_PROGRESS", "PAUSED", "CANCELLED", "CONFLICT"])("does not reopen %s", async status => {
    mock.db.stocktakeSession.findUnique.mockResolvedValue({ id: "s", status, updatedAt: date });
    expect((await request()).status).toBe(409);
    expect(mock.db.stocktakeSession.updateMany).not.toHaveBeenCalled();
  });
  it("preserves the original worker and saved quantities when reopening a completed session", async () => {
    mock.db.stocktakeSession.findUnique.mockResolvedValue({ id: "s", title: "棚卸", status: "COMPLETED", operatorUserId: "original-worker", updatedAt: date, completedAt: date });
    mock.db.stocktakeRecord.findMany.mockResolvedValue([{ inventoryInstanceId: "i", countedQuantity: 9, updatedAt: date }]);
    expect((await request()).status).toBe(200);
    expect(mock.db.stocktakeSession.updateMany.mock.calls[0][0].data).toEqual({ status: "IN_PROGRESS", pausedAt: null });
    expect(mock.db.adminActionLog.create.mock.calls[0][0].data.detail).toMatchObject({ operatorUserId: "original-worker", previousCompletedAt: date.toISOString(), previousRecords: [{ inventoryInstanceId: "i", countedQuantity: 9, updatedAt: date.toISOString() }] });
  });
  it("returns not found for a missing session", async () => {
    mock.db.stocktakeSession.findUnique.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
  });
  it("rejects a concurrent confirmation or a second reopen without reporting success", async () => {
    mock.db.stocktakeSession.updateMany.mockResolvedValue({ count: 0 });
    expect((await request()).status).toBe(409);
    expect(mock.db.adminActionLog.create).not.toHaveBeenCalled();
  });
});
