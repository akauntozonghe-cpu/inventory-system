import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const db = vi.hoisted(() => ({ classification: {upsert:vi.fn()}, stocktakeSession: { findMany: vi.fn(), updateMany: vi.fn() }, stocktakeTarget: { createMany: vi.fn() }, $transaction: vi.fn(), $executeRaw: vi.fn(), item: { findMany: vi.fn(), create: vi.fn() }, zaicoImportRecord: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }, storageLocation: { upsert: vi.fn() }, inventoryInstance: { create: vi.fn() }, inventoryEvent: { create: vi.fn() }, inventoryHistory: { create: vi.fn() }, adminActionLog: { create: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { importKey, processZaico } from "../src/lib/zaico-import-service";
import { normalizeZaicoRow } from "../src/lib/zaico-import";
const row = normalizeZaicoRow({ name: "商品", janCode: "4987379007563", quantity: "4", unit: "本" });
beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(fn => fn(db));
  db.item.findMany.mockResolvedValue([]);
  db.stocktakeSession.findMany.mockResolvedValue([]);
  db.stocktakeSession.updateMany.mockResolvedValue({ count: 1 });
  db.item.create.mockImplementation(({ data }) => Promise.resolve({ id: "new-item", ...data, isArchived: false }));
  db.inventoryInstance.create.mockResolvedValue({ id: "new-inventory" });
  db.zaicoImportRecord.findUnique.mockResolvedValue(null);
  db.zaicoImportRecord.create.mockImplementation(({ data }) => Promise.resolve({ id: "record", ...data }));
  db.zaicoImportRecord.update.mockImplementation(({ data }) => Promise.resolve({ id: "record", ...data }));
});
it("links existing JAN without creating any inventory, location or event", async () => {
  db.item.findMany.mockResolvedValue([{ id: "existing", name: "既存", janCode: row.janCode, isArchived: false }]);
  const result = await processZaico({ rows: [row] }, "admin");
  expect(result).toMatchObject({ linked: 1, created: 0 });
  expect(db.inventoryInstance.create).not.toHaveBeenCalled();
  expect(db.storageLocation.upsert).not.toHaveBeenCalled();
  expect(db.inventoryEvent.create).not.toHaveBeenCalled();
});
it("creates new stock and history, with nullable storage location", async () => {
  expect(await processZaico({ rows: [row] }, "admin")).toMatchObject({ created: 1 });
  expect(db.inventoryInstance.create).toHaveBeenCalledWith({ data: expect.objectContaining({ quantity: 4, actualQuantity: 4, storageLocationId: null, expirationDate: null }) });
  expect(db.inventoryEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ eventType: "IMPORT", quantityChange: 4 }) });
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
});
it("does not add quantity for a later row with the same JAN", async () => {
  expect(await processZaico({ rows: [row, { ...row, storageLocation: "別の場所" }] }, "admin")).toMatchObject({ created: 1, linked: 1 });
  expect(db.inventoryInstance.create).toHaveBeenCalledTimes(1);
});
it("persists ambiguous rows without adding inventory", async () => {
  const item = { id: "a", name: row.name, janCode: row.janCode, isArchived: false };
  db.item.findMany.mockResolvedValue([item, { ...item, id: "b" }]);
  expect(await processZaico({ rows: [row] }, "admin")).toMatchObject({ pending: 1 });
  expect(db.item.create).not.toHaveBeenCalled();
  expect(db.zaicoImportRecord.create).toHaveBeenCalledWith({ data: expect.objectContaining({ originalRow: row, status: "PENDING" }) });
});
it("replays completed imports without repeating writes", async () => {
  db.zaicoImportRecord.findUnique.mockResolvedValue({ id: "already", status: "CREATED" });
  expect(await processZaico({ rows: [row] }, "admin")).toMatchObject({ skipped: 1, created: 0 });
  expect(db.item.create).not.toHaveBeenCalled();
  expect(importKey(row)).toBe(importKey({ ...row }));
});
it("review cannot force a link to a product with a different JAN", async () => {
  db.zaicoImportRecord.findUnique.mockResolvedValue({ id: "pending", status: "PENDING" });
  db.item.findMany.mockResolvedValue([{ id: "wrong", name: row.name, janCode: "4901234567894", isArchived: false }]);
  expect(await processZaico({ reviews: [{ id: "pending", row, mode: "LINK", itemId: "wrong" }] }, "admin")).toMatchObject({ pending: 1 });
  expect(db.inventoryInstance.create).not.toHaveBeenCalled();
});
it("bulk review permits explicit no-JAN creation and exclusion", async () => {
  db.zaicoImportRecord.findUnique.mockResolvedValue({ id: "pending", status: "PENDING" });
  expect(await processZaico({ reviews: [{ id: "pending", row: { ...row, janCode: "" }, mode: "NEW_NO_JAN" }, { id: "exclude", row, mode: "SKIP" }] }, "admin")).toMatchObject({ created: 1, skipped: 1 });
  expect(db.item.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ janCode: null, systemBarcode: expect.stringMatching(/^20\d{11}$/) }) }));
});
it("retries serialization conflicts before reporting a failed import", async () => {
  db.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "6" }));
  expect(await processZaico({ rows: [row] }, "admin")).toMatchObject({ created: 1 });
  expect(db.$transaction).toHaveBeenCalledTimes(2);
});

it("adds new stock only to matching ongoing stocktakes without counting it", async () => {
  db.stocktakeSession.findMany.mockResolvedValue([{ id: "all", status: "IN_PROGRESS", scopeType: "ALL", scopeValue: null }, { id: "other", status: "PAUSED", scopeType: "MAJOR_CATEGORY", scopeValue: "食料品" }]);
  await processZaico({ rows: [row] }, "admin");
  expect(db.stocktakeSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { in: ["IN_PROGRESS", "PAUSED"] } } }));
  expect(db.stocktakeTarget.createMany).toHaveBeenCalledOnce();
  expect(db.stocktakeTarget.createMany).toHaveBeenCalledWith({ data: [{ sessionId: "all", inventoryInstanceId: "new-inventory", expectedQuantity: 4 }], skipDuplicates: true });
});

it("keeps original invalid JAN in the record while assigning a scannable system JAN",async()=>{
  const input={...row,janCode:"4.98E+12"};
  await processZaico({rows:[input]},"admin");
  const data=db.item.create.mock.calls[0][0].data;
  expect(data.janCode).toBe(null);expect(data.systemBarcode).toMatch(/^20\d{11}$/);
  expect(db.zaicoImportRecord.create).toHaveBeenCalledWith({data:expect.objectContaining({originalRow:input,row:input})});
});
