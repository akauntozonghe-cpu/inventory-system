import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({ appUser: { findUnique: vi.fn() }, salesRecommendationSetting: { upsert: vi.fn() }, shippingRate: { create: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ requireLogin: () => ({ user: { id: "worker" } }) }));
import { POST } from "../src/app/api/admin/marketplace/advisor/route";
const request = (body: object) => POST(new NextRequest("http://localhost/api/admin/marketplace/advisor", { method: "POST", body: JSON.stringify(body) }));
beforeEach(() => { vi.clearAllMocks(); db.appUser.findUnique.mockResolvedValue({ role: "WORKER", featurePermissions: ["MARKETPLACE_SETTINGS"] }); });
it("saves shipping origin and days in the same shared setting", async () => {
  expect((await request({ action: "SAVE_RECOMMENDATION_SETTING", targetProfitRateBps: 2000, shippingOriginPrefecture: "広島県", shippingLeadDays: 2 }))?.status).toBe(200);
  expect(db.salesRecommendationSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { targetProfitRateBps: 2000, shippingOriginPrefecture: "広島県", shippingLeadDays: 2 } }));
});
it("rejects unauthorized changes and malformed shipping settings", async () => {
  db.appUser.findUnique.mockResolvedValue({ role: "WORKER", featurePermissions: [] });
  expect((await request({ action: "SAVE_RECOMMENDATION_SETTING", targetProfitRateBps: 2000 }))?.status).toBe(403);
  expect(db.salesRecommendationSetting.upsert).not.toHaveBeenCalled();
  db.appUser.findUnique.mockResolvedValue({ role: "ADMIN", featurePermissions: [] });
  expect((await request({ action: "SAVE_RECOMMENDATION_SETTING", targetProfitRateBps: 2000, shippingOriginPrefecture: "unknown" }))?.status).toBe(400);
  expect(db.salesRecommendationSetting.upsert).not.toHaveBeenCalled();
});
it("does not silently convert missing or fractional shipping fees to zero", async () => {
  for (const fee of [null, "", 1.5, -1]) expect((await request({ action: "SAVE_SHIPPING_RATE", methodName: "配送", fee }))?.status).toBe(400);
  expect(db.shippingRate.create).not.toHaveBeenCalled();
  expect((await request({ action: "SAVE_SHIPPING_RATE", methodName: "配送", fee: 0, originPrefecture: "広島県" }))?.status).toBe(200);
  expect(db.shippingRate.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fee: 0, originPrefecture: "広島県" }) });
});
