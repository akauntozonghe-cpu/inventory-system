import { describe, expect, it } from "vitest";
import { resolveStocktakeRegistration } from "../src/lib/stocktake-registration";

describe("stocktake item registration", () => {
  it("新規商品は入力数量で棚卸済みにする", () => {
    expect(resolveStocktakeRegistration(null, 7)).toEqual({
      alreadyRegistered: false,
      countedQuantity: 7,
    });
  });

  it("同じ在庫があれば追加せず登録済みとして扱う", () => {
    expect(
      resolveStocktakeRegistration({ quantity: 12, actualQuantity: null }, 5)
    ).toEqual({
      alreadyRegistered: true,
      countedQuantity: 12,
    });
  });

  it("登録済み在庫の実在庫数を優先する", () => {
    expect(
      resolveStocktakeRegistration({ quantity: 12, actualQuantity: 10 }, 5)
    ).toEqual({
      alreadyRegistered: true,
      countedQuantity: 10,
    });
  });
});
