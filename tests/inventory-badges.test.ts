import { expect, it } from "vitest";
import { inventoryBadges, type BadgeStock } from "../src/lib/inventory-badges";
const now = Date.parse("2026-09-12T03:00:00Z");
const keys = (stocks: BadgeStock[], item = {}) => inventoryBadges(item, stocks, now).map(b => b.key);
it("marks new products and new lots for exactly seven days, not future or invalid dates", () => {
  expect(keys([], { createdAt: new Date(now - 7 * 86400000 + 1).toISOString() })).toContain("new");
  expect(keys([], { createdAt: new Date(now - 7 * 86400000).toISOString() })).not.toContain("new");
  expect(keys([{ quantity: 1, createdAt: new Date(now).toISOString() }])).toContain("new");
  for (const createdAt of ["invalid", new Date(now + 1).toISOString()]) expect(keys([], { createdAt })).not.toContain("new");
});
it("distinguishes overdue, due today and approaching expiry in Japan", () => {
  expect(keys([{ quantity: 1, expirationDate: "2026-09-11" }, { quantity: 1, expirationDate: "2026-09-12" }, { quantity: 1, expirationDate: "2026-09-20" }])).toEqual(["expired", "today", "near"]);
  expect(keys([{ quantity: 1, expirationDate: "2026-10-13" }])).toEqual([]);
});
it("uses month-end dates and the configured alert period", () => {
  expect(keys([{ quantity: 1, expirationDate: "2026-09" }])).toEqual(["near"]);
  expect(keys([{ quantity: 1, expirationDate: "2026-10-22", expirationAlertDays: 45 }])).toEqual(["near"]);
  expect(keys([{ quantity: 1, expirationDate: "2026-10-01", expirationAlertDays: 10 }])).toEqual([]);
});
it("does not flag depleted, archived, unset or no-expiry stock", () => {
  const base = { quantity: 1, expirationDate: "2026-01-01" };
  for (const stock of [{ ...base, quantity: 0 }, { ...base, status: "廃止" }, { ...base, expirationManagementStatus: "NO_EXPIRY" }, { ...base, expirationManagementStatus: "UNSET" }]) expect(keys([stock])).not.toContain("expired");
  expect(keys([base], { isArchived: true })).toEqual([]);
});
it("shows concurrent marketplace states without treating cancelled listings as active", () => {
  const listing = (id: string, status: string, shippingStatus = "NOT_READY") => ({ id, status, shippingStatus, listedQuantity: 1, soldQuantity: status === "SOLD" ? 1 : 0 });
  expect(keys([{ quantity: 3, marketplaceListings: [listing("a", "DRAFT"), listing("b", "LISTED"), listing("c", "SOLD", "PACKING"), listing("d", "CANCELLED")] }])).toEqual(["preparing", "listed", "shipping"]);
  expect(keys([{ quantity: 0, marketplaceListings: [listing("c", "SOLD", "SHIPPED")] }])).toEqual(["empty"]);
  expect(keys([{ quantity: 1, allocationType: "flea_market" }])).toEqual(["allocation"]);
});
it("deduplicates lot warnings while retaining the number affected", () => {
  const badges = inventoryBadges({}, [{ quantity: 1, expirationDate: "2026-01-01" }, { quantity: 2, expirationDate: "2026-02-01" }], now);
  expect(badges).toHaveLength(1); expect(badges[0].detail).toContain("2件");
});
