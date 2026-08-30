import { describe, expect, it } from "vitest";
import { calculateMarketplaceProfit } from "../src/lib/personal-marketplace";

describe("calculateMarketplaceProfit", () => {
  it("販売手数料・送料・梱包費・原価を差し引く", () => {
    expect(calculateMarketplaceProfit({ price: 3000, quantity: 1, fee: 300, shippingCost: 750, packagingCost: 100, acquisitionCostPerItem: 500 })).toEqual({
      sales: 3000,
      costs: 1650,
      profit: 1350,
      profitRateBps: 4500,
    });
  });

  it("複数個販売では売上と原価だけ数量分にする", () => {
    expect(calculateMarketplaceProfit({ price: 1000, quantity: 2, fee: 200, shippingCost: 500, packagingCost: 100, acquisitionCostPerItem: 250 }).profit).toBe(700);
  });

  it("異常な負数を利益の水増しに使わない", () => {
    expect(calculateMarketplaceProfit({ price: 1000, quantity: 1, fee: -100, shippingCost: -1, packagingCost: -1, acquisitionCostPerItem: -1 }).profit).toBe(1000);
  });

  it("売上ゼロでは利益率をゼロにする", () => {
    expect(calculateMarketplaceProfit({ price: 0, quantity: 1, fee: 0, shippingCost: 0, packagingCost: 0, acquisitionCostPerItem: 0 }).profitRateBps).toBe(0);
  });
});
