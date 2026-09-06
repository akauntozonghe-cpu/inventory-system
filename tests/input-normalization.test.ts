import { describe, expect, it } from "vitest";
import { janCodeValidationMessage, normalizeAsciiCodeInput, normalizeDisplayText, normalizeIdentifier, normalizeJanCode, normalizeJanInput } from "../src/lib/input-normalization";

describe("input normalization", () => {
  it("normalizes full-width text and repeated whitespace", () => {
    expect(normalizeDisplayText("  ＡＢＣ　 商品  ", 100)).toBe("ABC 商品");
  });

  it("normalizes identifiers without changing meaningful punctuation", () => {
    expect(normalizeIdentifier(" lot-ab 12 ", 100)).toBe("LOT-AB12");
  });

  it("normalizes full-width JAN input and limits it to digits", () => {
    expect(normalizeJanCode("４９０－１２３ 4567890")).toBe("4901234567890");
    expect(normalizeJanInput("４９０a-12345678901234")).toBe("4901234567890");
  });

  it("accepts only JAN-8 or JAN-13 length", () => {
    expect(janCodeValidationMessage("12345678")).toBeNull();
    expect(janCodeValidationMessage("4901234567890")).toBeNull();
    expect(janCodeValidationMessage("1234")).toContain("8桁または13桁");
    expect(janCodeValidationMessage("1234567A")).toContain("数字だけ");
  });

  it("converts full-width codes and removes non-ASCII characters", () => {
    expect(normalizeAsciiCodeInput("ａｂ-１２ 商品")).toBe("AB-12");
  });
});
