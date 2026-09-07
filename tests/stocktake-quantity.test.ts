import { describe, expect, it } from "vitest";
import { parseStocktakeQuantity, stepStocktakeQuantity } from "../src/lib/stocktake-quantity";

describe("棚卸数量の入力", () => {
  it("全角数字、前後の空白、ゼロを受け付ける", () => {
    expect(parseStocktakeQuantity(" １２３ ")).toBe(123);
    expect(parseStocktakeQuantity("０")).toBe(0);
  });
  it("空欄・小数・指数表記・負数・桁あふれを数量にしない", () => {
    for (const value of ["", " ", "1.5", "1e3", "0x10", "-1", "9007199254740992", "1個"]) {
      expect(parseStocktakeQuantity(value)).toBeNull();
    }
  });
  it("加減算はゼロと安全な整数の範囲を守り、入力途中を壊さない", () => {
    expect(stepStocktakeQuantity("０", -1)).toBe("0");
    expect(stepStocktakeQuantity("９", 1)).toBe("10");
    expect(stepStocktakeQuantity("9007199254740991", 1)).toBe("9007199254740991");
    expect(stepStocktakeQuantity("", 1)).toBe("");
  });
});
