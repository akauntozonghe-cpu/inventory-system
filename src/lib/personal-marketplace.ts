export type MarketplaceProfitInput = {
  price: number;
  quantity: number;
  fee: number;
  shippingCost: number;
  packagingCost: number;
  acquisitionCostPerItem: number;
};

export function calculateMarketplaceProfit(input: MarketplaceProfitInput) {
  const sales = Math.max(0, input.price) * Math.max(0, input.quantity);
  const costs =
    Math.max(0, input.fee) +
    Math.max(0, input.shippingCost) +
    Math.max(0, input.packagingCost) +
    Math.max(0, input.acquisitionCostPerItem) * Math.max(0, input.quantity);

  return {
    sales,
    costs,
    profit: sales - costs,
    profitRateBps: sales > 0 ? Math.round(((sales - costs) / sales) * 10_000) : 0,
  };
}
