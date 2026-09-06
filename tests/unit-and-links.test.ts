import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { displayUnit, unitValidationMessage } from "../src/lib/unit";
import { syncItemLinks } from "../src/lib/item-links";
import { renameClassificationMaster } from "../src/lib/classification-links";

describe("shared product information", () => {
  it.each(["0", "０", "10", 0, "  "])("rejects a quantity masquerading as a unit: %s", (unit) => { expect(unitValidationMessage(unit)).toBeTruthy(); });
  it.each(["個", "箱", "kg", "12本入り箱"])("accepts a named unit: %s", (unit) => { expect(unitValidationMessage(unit)).toBeNull(); });
  it("never displays 1 + unit 0 as the misleading quantity 10", () => {
    expect(`${1}${displayUnit("0")}`).toBe("1（単位未設定）");
    expect(`${1}${displayUnit("0", "個")}`).toBe("1個");
  });
  it("updates common fields and inherited units without converting quantities or explicit box units", async () => {
    const update = vi.fn();
    const tx = { inventoryInstance: { updateMany: update }, classification: { upsert: vi.fn() } } as unknown as Prisma.TransactionClient;
    const before = { majorCategory: "旧分類", minorCategory: null, manufacturer: "会社", defaultUnit: "個" };
    await syncItemLinks(tx, "item", before, { ...before, majorCategory: "新分類", defaultUnit: "本" });
    expect(update).toHaveBeenNthCalledWith(1, { where: { itemId: "item" }, data: { majorCategory: "新分類" } });
    expect(update.mock.calls[1][0].data).toEqual({ unit: "本" });
    expect(update.mock.calls[1][0].where.OR).not.toContainEqual({ unit: "箱" });
    expect(update.mock.calls[1][0].where.OR).toContainEqual({ unit: "0" });
  });
  it("does not touch lot units when only the product name is edited", async () => {
    const update = vi.fn();
    const tx = { inventoryInstance: { updateMany: update }, classification: { upsert: vi.fn() } } as unknown as Prisma.TransactionClient;
    const fields = { majorCategory: "食品", minorCategory: null, manufacturer: null, defaultUnit: "個" };
    await syncItemLinks(tx, "item", fields, fields);
    expect(update).not.toHaveBeenCalled();
  });
  it("keeps old minor-category QR aliases when merging duplicate child names", async () => {
    const alias = { updateMany: vi.fn(), upsert: vi.fn() };
    const master = { findUnique: vi.fn().mockResolvedValueOnce({ id: "from", labelCode: "old-qr" }).mockResolvedValueOnce({ id: "to" }), delete: vi.fn() };
    const tx = { classification: master, classificationLabelAlias: alias } as unknown as Prisma.TransactionClient;
    await renameClassificationMaster(tx, "MINOR", "飲料", "食品A", "飲料", "食品B");
    expect(alias.upsert).toHaveBeenCalledWith({ where: { labelCode: "old-qr" }, update: { classificationId: "to" }, create: { labelCode: "old-qr", classificationId: "to" } });
    expect(master.delete).toHaveBeenCalledWith({ where: { id: "from" } });
  });
});
