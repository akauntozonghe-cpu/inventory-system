import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), log: vi.fn(),
  db: {
    item: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    storageLocation: { findUnique: vi.fn() },
    inventoryInstance: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    itemRegistrationRequest: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    inventoryHistory: { create: vi.fn() }, inventoryEvent: { create: vi.fn() },
    notification: { create: vi.fn() }, adminActionLog: { create: vi.fn() }, $transaction: vi.fn(), $executeRaw: vi.fn(),
    appUser: { findUnique: vi.fn() }, stocktakeSession: { findUnique: vi.fn() },
    stocktakeTarget: { upsert: vi.fn() }, stocktakeRecord: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth", () => ({
  requireLogin: () => ({ user: { id: "user" } }),
  getLoggedInUser: () => ({ id: "user", displayName: "利用者" }),
  hasAdminAccess: mocks.admin,
  requireAdmin: () => ({ user: { id: "admin" } }),
}));
vi.mock("@/lib/edit-access", () => ({ requireEditAccess: async () => ({ user: { id: "admin" }, authorization: { mode: "STANDARD_ADMIN" } }) }));
vi.mock("@/lib/error-report", () => ({ createAdminActionLog: mocks.log }));
vi.mock("@/lib/device-push", () => ({ scheduleDeviceNotifications: vi.fn() }));
vi.mock("@/lib/item-links", () => ({ ensureClassification: vi.fn() }));
import { POST as register } from "../src/app/api/items/register/route";
import { PATCH as review } from "../src/app/api/admin/registration-requests/route";
import { PATCH as edit } from "../src/app/api/inventory/[id]/route";
import { POST as stocktakeRegister } from "../src/app/api/stocktake/register-item/route";
import { POST as addStock } from "../src/app/api/inventory/route";
import { validJan } from "../src/lib/zaico-import";
import { POST as issueBarcode } from "../src/app/api/items/system-barcode/route";

const item = { id: "item", name: "商品", janCode: "4901234567894" };
const existing = { id: "stock", itemId: "item", quantity: 2, actualQuantity: 2, expirationDate: "2026-12", expirationManagementStatus: "ACTIVE", storageLocationId: null, item };
const registration = { name: "商品", janCode: "4901234567894", quantity: 2, expirationDate: "", expirationNotApplicable: true };
const request = (body: object, method = "POST") => new NextRequest("http://localhost/api/test", { method, body: JSON.stringify(body) });
const patch = (body: object) => edit(request({ reason: "期限訂正", ...body }, "PATCH"), { params: Promise.resolve({ id: "stock" }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockReturnValue(true);
  mocks.db.$transaction.mockImplementation(fn => fn(mocks.db));
  mocks.db.item.findFirst.mockResolvedValue(null);
  mocks.db.item.findUnique.mockResolvedValue(item);
  mocks.db.item.create.mockResolvedValue(item);
  mocks.db.inventoryInstance.findUnique.mockResolvedValue(existing);
  mocks.db.inventoryInstance.create.mockImplementation(async ({ data }) => ({ ...existing, ...data, item }));
  mocks.db.inventoryInstance.update.mockImplementation(async ({ data }) => ({ ...existing, ...data, item }));
  mocks.db.itemRegistrationRequest.create.mockImplementation(async ({ data }) => ({ id: "request", status: "PENDING", ...data }));
  mocks.db.itemRegistrationRequest.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.storageLocation.findUnique.mockResolvedValue({ id: "shelf", name: "棚" });
  mocks.db.appUser.findUnique.mockResolvedValue({ isActive: true, featurePermissions: ["ITEM_REGISTER"] });
  mocks.db.stocktakeSession.findUnique.mockResolvedValue({ id: "session", status: "IN_PROGRESS" });
  mocks.db.stocktakeTarget.upsert.mockResolvedValue({ expectedQuantity: 2, inventoryInstance: { ...existing, item } });
});

describe("legacy system code replacement", () => {
  const legacy = { id: "item", name: "商品", janCode: null, systemBarcode: "SYS-C0632B49480B4493B4" };
  it("preserves an old code unless replacement is explicitly requested", async () => {
    mocks.db.item.findUnique.mockResolvedValue(legacy);
    expect((await issueBarcode(request({itemId:"item"}))).status).toBe(200);
    expect(mocks.db.item.update).not.toHaveBeenCalled();
  });
  it("replaces only the confirmed legacy code without altering stock rows", async () => {
    mocks.db.item.findUnique.mockResolvedValue(legacy);
    mocks.db.item.update.mockImplementation(async ({data})=>({...legacy,...data}));
    expect((await issueBarcode(request({itemId:"item",replaceLegacy:true,expectedBarcode:legacy.systemBarcode}))).status).toBe(200);
    const call=mocks.db.item.update.mock.calls[0][0];
    expect(call.where.AND).toContainEqual({systemBarcode:legacy.systemBarcode});
    expect(Object.keys(call.data)).toEqual(["systemBarcode"]);
    expect(call.data.systemBarcode).toMatch(/^20\d{11}$/);
    expect(validJan(call.data.systemBarcode)).toBe(true);
    expect(mocks.db.inventoryInstance.update).not.toHaveBeenCalled();
    expect(mocks.log.mock.calls[0][0].detail.before.systemBarcode).toBe(legacy.systemBarcode);
  });
  it("rejects replacement if another device changed the code", async () => {
    mocks.db.item.findUnique.mockResolvedValue({...legacy,systemBarcode:"2001234567893"});
    expect((await issueBarcode(request({itemId:"item",replaceLegacy:true,expectedBarcode:legacy.systemBarcode}))).status).toBe(409);
    expect(mocks.db.item.update).not.toHaveBeenCalled();
  });
  it("does not replace a manufacturer JAN", async () => {
    mocks.db.item.findUnique.mockResolvedValue(item);
    expect((await issueBarcode(request({itemId:"item",replaceLegacy:true,expectedBarcode:legacy.systemBarcode}))).status).toBe(409);
    expect(mocks.db.item.update).not.toHaveBeenCalled();
  });
});

describe("shared JAN with independent inventory IDs", () => {
  it("issues a numeric 13-digit system JAN when stocktake registers an uncoded item", async () => {
    expect((await stocktakeRegister(request({ ...registration, janCode: "", sessionId: "session", storageLocationId: "shelf" }))).status).toBe(201);
    const code = mocks.db.item.create.mock.calls[0][0].data.systemBarcode;
    expect(code).toMatch(/^20\d{11}$/);
    expect(validJan(code)).toBe(true);
  });
  it("creates a new stocktake inventory even when an identical lot already exists", async () => {
    mocks.db.item.findFirst.mockResolvedValue(item);
    mocks.db.inventoryInstance.findFirst.mockResolvedValue(existing);
    expect((await stocktakeRegister(request({ ...registration, sessionId: "session", storageLocationId: "shelf" }))).status).toBe(201);
    expect(mocks.db.inventoryInstance.findFirst).not.toHaveBeenCalled();
    expect(mocks.db.inventoryInstance.update).not.toHaveBeenCalled();
    expect(mocks.db.inventoryInstance.create).toHaveBeenCalledOnce();
  });
  it("does not create another stock if a concurrent reviewer already approved the request", async () => {
    mocks.db.itemRegistrationRequest.findUnique.mockResolvedValue({ id: "request", status: "PENDING", scannedCode: item.janCode, ...registration });
    mocks.db.itemRegistrationRequest.updateMany.mockResolvedValue({ count: 0 });
    expect((await review(request({ requestId: "request", action: "APPROVE" }))).status).toBe(409);
    expect(mocks.db.inventoryInstance.create).not.toHaveBeenCalled();
  });
  it.each([
    { lotNo: "LOT-B" },
    { majorCategory: "備品", minorCategory: "店舗用" },
    { storageLocationId: "shelf-B" },
  ])("registers a separate stock under the existing JAN for %j", async dimensions => {
    mocks.db.item.findFirst.mockResolvedValue(item);
    expect((await register(request({ ...registration, ...dimensions }))).status).toBe(201);
    expect(mocks.db.item.create).not.toHaveBeenCalled();
    expect(mocks.db.inventoryInstance.update).not.toHaveBeenCalled();
    expect(mocks.db.inventoryInstance.create.mock.calls[0][0].data).toMatchObject({ itemId: "item", ...dimensions });
  });
  it("uses an existing system JAN in the same way as a manufacturer JAN", async () => {
    mocks.db.item.findFirst.mockResolvedValue({ ...item, janCode: null, systemBarcode: "2001234567893" });
    expect((await register(request({ ...registration, janCode: "2001234567893" }))).status).toBe(201);
    expect(mocks.db.item.create).not.toHaveBeenCalled();
    expect(mocks.db.inventoryInstance.create.mock.calls[0][0].data.itemId).toBe("item");
  });
  it("approves an additional stock request for an already registered JAN", async () => {
    mocks.db.item.findFirst.mockResolvedValue(item);
    mocks.db.itemRegistrationRequest.findUnique.mockResolvedValue({ id: "request", status: "PENDING", scannedCode: item.janCode, ...registration, majorCategory: "備品", minorCategory: "店頭", lotNo: "LOT-B" });
    expect((await review(request({ requestId: "request", action: "APPROVE" }))).status).toBe(200);
    expect(mocks.db.item.create).not.toHaveBeenCalled();
    expect(mocks.db.inventoryInstance.create.mock.calls[0][0].data).toMatchObject({ itemId: "item", majorCategory: "備品", minorCategory: "店頭", lotNo: "LOT-B", expirationManagementStatus: "NO_EXPIRY" });
  });
  it("stocktake registration distinguishes classifications and no-expiry policy", async () => {
    mocks.db.item.findFirst.mockResolvedValue({ ...item, majorCategory: "食品", minorCategory: "飲料" });
    mocks.db.inventoryInstance.findFirst.mockResolvedValue(null);
    expect((await stocktakeRegister(request({ ...registration, sessionId: "session", storageLocationId: "shelf", majorCategory: "備品", minorCategory: "店頭" }))).status).toBe(201);
    expect(mocks.db.inventoryInstance.findFirst).not.toHaveBeenCalled();
    expect(mocks.db.inventoryInstance.create.mock.calls[0][0].data).toMatchObject({ itemId: "item", majorCategory: "備品", minorCategory: "店頭" });
    expect(mocks.db.item.create).not.toHaveBeenCalled();
  });
  it("stock creation does not add quantity to an unrelated existing row", async () => {
    mocks.db.inventoryInstance.findFirst.mockResolvedValue(existing);
    expect((await addStock(request({ itemId: "item", quantity: 3, expirationNotApplicable: true, majorCategory: "備品", minorCategory: "店頭" }))).status).toBe(201);
    expect(mocks.db.inventoryInstance.update).not.toHaveBeenCalled();
    expect(mocks.db.inventoryInstance.create.mock.calls[0][0].data).toMatchObject({ quantity: 3, majorCategory: "備品", expirationDate: null, expirationManagementStatus: "NO_EXPIRY" });
  });
});

describe("explicit no-expiry registration", () => {
  it("retains a worker's automatic-code choice for approval", async () => {
    mocks.admin.mockReturnValue(false);
    const response=await register(request({...registration,janCode:"",generateSystemBarcode:true}));
    expect(response.status).toBe(201);
    expect(mocks.db.itemRegistrationRequest.create.mock.calls[0][0].data).toMatchObject({scannedCode:null,generateSystemBarcode:true});
    expect(mocks.db.item.create).not.toHaveBeenCalled();
  });
  it("automatically numbers an approved request with the saved system-JAN choice", async () => {
    mocks.db.itemRegistrationRequest.findUnique.mockResolvedValue({id:"request",status:"PENDING",...registration,scannedCode:null,generateSystemBarcode:true});
    mocks.db.item.findUnique.mockResolvedValue(null);
    expect((await review(request({requestId:"request",action:"APPROVE"}))).status).toBe(200);
    const code=mocks.db.item.create.mock.calls[0][0].data.systemBarcode;
    expect(code).toMatch(/^20\d{11}$/);expect(validJan(code)).toBe(true);
  });
  it("registers a no-expiry inventory and clears a stale date", async () => {
    const response = await register(request({ ...registration, expirationDate: "2026-12" }));
    expect(response.status).toBe(201);
    expect(mocks.db.inventoryInstance.create.mock.calls[0][0].data).toMatchObject({ expirationDate: null, expirationManagementStatus: "NO_EXPIRY" });
  });
  it("keeps the selection throughout a worker request and administrator approval", async () => {
    mocks.admin.mockReturnValue(false);
    expect((await register(request(registration))).status).toBe(201);
    const saved = mocks.db.itemRegistrationRequest.create.mock.calls[0][0].data;
    expect(saved).toMatchObject({ expirationDate: null, expirationNotApplicable: true });
    mocks.db.itemRegistrationRequest.findUnique.mockResolvedValue({ id: "request", status: "PENDING", ...saved });
    const response = await review(request({ requestId: "request", action: "APPROVE" }));
    expect(response.status).toBe(200);
    expect(mocks.db.inventoryInstance.create.mock.calls[0][0].data).toMatchObject({ expirationDate: null, expirationManagementStatus: "NO_EXPIRY" });
  });
  it("does not silently treat a missing date as no expiry", async () => {
    const response = await register(request({ ...registration, expirationNotApplicable: false }));
    expect(response.status).toBe(400);
    expect(mocks.db.inventoryInstance.create).not.toHaveBeenCalled();
  });
  it("still supports month-only expiry", async () => {
    expect((await register(request({ ...registration, expirationNotApplicable: false, expirationDate: "2027-03" }))).status).toBe(201);
    expect(mocks.db.inventoryInstance.create.mock.calls[0][0].data).toMatchObject({ expirationDate: "2027-03", expirationManagementStatus: "ACTIVE" });
  });
});

describe("inventory expiry editing", () => {
  it("does not let editing permission perform an archive operation", async () => {
    expect((await patch({ status: "廃止" })).status).toBe(403);
    expect(mocks.db.inventoryInstance.update).not.toHaveBeenCalled();
  });
  it("rejects an editor that opened an older version before changing the stock", async () => {
    mocks.db.inventoryInstance.findUnique.mockResolvedValue({ ...existing, updatedAt: new Date("2026-09-22T02:00:00Z") });
    expect((await patch({ expirationNotApplicable: true, expectedUpdatedAt: "2026-09-22T01:00:00.000Z" })).status).toBe(409);
    expect(mocks.db.inventoryInstance.update).not.toHaveBeenCalled();
  });
  it("changes to no expiry and journals both the date and policy", async () => {
    expect((await patch({ expirationNotApplicable: true, expirationDate: "2026-12" })).status).toBe(200);
    expect(mocks.db.inventoryInstance.update.mock.calls[0][0].data).toMatchObject({ expirationDate: null, expirationManagementStatus: "NO_EXPIRY" });
    expect(mocks.log.mock.calls[0][0].detail).toMatchObject({ before: { expirationManagementStatus: "ACTIVE" }, after: { expirationManagementStatus: "NO_EXPIRY", expirationDate: null } });
  });
  it("reactivates expiry management when a date is added", async () => {
    mocks.db.inventoryInstance.findUnique.mockResolvedValue({ ...existing, expirationDate: null, expirationManagementStatus: "NO_EXPIRY" });
    expect((await patch({ expirationNotApplicable: false, expirationDate: "2027-03" })).status).toBe(200);
    expect(mocks.db.inventoryInstance.update.mock.calls[0][0].data).toMatchObject({ expirationDate: "2027-03", expirationManagementStatus: "ACTIVE" });
  });
  it("distinguishes clearing a date from explicitly choosing no expiry", async () => {
    expect((await patch({ expirationDate: "" })).status).toBe(200);
    expect(mocks.db.inventoryInstance.update.mock.calls[0][0].data).toMatchObject({ expirationDate: null, expirationManagementStatus: "UNSET" });
  });
  it.each(["NO_EXPIRY", "ACKNOWLEDGED", "RESOLVED"])("preserves %s when other fields are edited", async status => {
    mocks.db.inventoryInstance.findUnique.mockResolvedValue({ ...existing, expirationManagementStatus: status });
    expect((await patch({ memo: "メモ訂正" })).status).toBe(200);
    expect(mocks.db.inventoryInstance.update.mock.calls[0][0].data.expirationManagementStatus).toBe(status);
  });
  it("rejects malformed flags without saving", async () => {
    expect((await patch({ expirationNotApplicable: "false" })).status).toBe(400);
    expect(mocks.db.inventoryInstance.update).not.toHaveBeenCalled();
  });
});
