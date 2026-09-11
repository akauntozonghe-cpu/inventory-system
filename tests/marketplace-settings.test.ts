import { expect, it } from "vitest";
import { parseShippingPreferences, shippingDeadline, marketplaceTakeHome } from "../src/lib/marketplace-settings";
it("validates prefectures and shipping lead days without resetting omitted settings", () => {
  expect(parseShippingPreferences({})).toEqual({});
  expect(parseShippingPreferences({ shippingOriginPrefecture: "広島県", shippingLeadDays: 3 })).toEqual({ shippingOriginPrefecture: "広島県", shippingLeadDays: 3 });
  expect(parseShippingPreferences({ shippingOriginPrefecture: "", shippingLeadDays: null })).toEqual({ shippingOriginPrefecture: null, shippingLeadDays: null });
  expect(() => parseShippingPreferences({ shippingOriginPrefecture: "somewhere" })).toThrow();
  for (const days of [0, 8, -1, 1.5, "3"]) expect(() => parseShippingPreferences({ shippingLeadDays: days })).toThrow();
});
it("sets a Japanese calendar deadline even across UTC date and month boundaries", () => {
  expect(shippingDeadline(new Date("2026-09-30T16:00:00Z"), 2)?.toISOString()).toBe("2026-10-03T14:59:59.999Z");
  expect(shippingDeadline(new Date(), null)).toBeNull();
});
it("shows take-home proceeds before acquisition cost while preserving unknown and zero costs", () => {
  expect(marketplaceTakeHome(1000, 2, 1000, 210, 50)).toBe(1540);
  expect(marketplaceTakeHome(1000, 1, 1000, 210, 0)).toBe(690);
  expect(marketplaceTakeHome(1000, 1, 1000, 210, null)).toBeNull();
  expect(marketplaceTakeHome(1000, 1, null, 210, 50, 100)).toBe(640);
  expect(marketplaceTakeHome(1000, 1, null, 210, 50)).toBeNull();
  expect(marketplaceTakeHome(1000, 0, 1000, 210, 0)).toBeNull();
});
