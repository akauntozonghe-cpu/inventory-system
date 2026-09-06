import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({ item: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() }, inventoryInstance: { updateMany: vi.fn() }, classification: { upsert: vi.fn() }, $transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ requireAdmin: () => ({ user: { id: "admin" } }) }));
vi.mock("@/lib/error-report", () => ({ createAdminActionLog: vi.fn() }));
import { PUT } from "../src/app/api/items/[id]/route";
const original = { id: "item", name: "旧商品名", janCode: null, systemBarcode: null, managementCode: "ITEM-A", managementGroupCode: "GROUP-A", manufacturer: "メーカー", majorCategory: "食品", minorCategory: "飲料", defaultUnit: "個" };
const request = (body: object) => PUT(new NextRequest("http://localhost/api/items/item", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "item" }) });
describe("product editing during stocktake", () => {
  beforeEach(() => {
    vi.clearAllMocks(); db.item.findUnique.mockResolvedValue(original); db.item.findFirst.mockResolvedValue(null);
    db.item.update.mockImplementation(async ({ data }) => ({ ...original, ...data }));
    db.$transaction.mockImplementation(async (operation) => operation(db));
  });
  it("retains omitted identifiers and categories when another editor only changes the name", async () => {
    const response = await request({ name: "新商品名", reason: "誤記修正" });
    expect(response.status).toBe(200);
    expect(db.item.update.mock.calls[0][0].data).toMatchObject({ name: "新商品名", managementCode: "ITEM-A", majorCategory: "食品", minorCategory: "飲料", defaultUnit: "個" });
  });
  it("prevents the stocktake dialog from overwriting a newer edit on another device", async () => {
    db.item.update.mockRejectedValue({ code: "P2025" });
    const timestamp = "2026-09-06T00:00:00.000Z";
    const response = await request({ name: "変更", reason: "修正", expectedUpdatedAt: timestamp });
    expect(response.status).toBe(409);
    expect(db.item.update.mock.calls[0][0].where).toEqual({ id: "item", updatedAt: new Date(timestamp) });
    expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a child category without a parent without writing any data", async () => {
    const response = await request({ name: "商品", reason: "修正", majorCategory: "", minorCategory: "飲料" });
    expect(response.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
