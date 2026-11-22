import { describe, expect, it } from "vitest";
import { janCodeValidationMessage, normalizeAsciiCodeInput, normalizeDisplayText, normalizeIdentifier, normalizeJanCode, normalizeJanInput } from "../src/lib/input-normalization";

describe("input normalization", () => {
  it("normalizes full-width text and repeated whitespace", () => {
    expect(normalizeDisplayText("  ＡＢＣ　 商品  ", 100)).toBe("ABC 商品");
  });

  it("uses half-width digits consistently, including classification labels and zero-padded codes", () => {
    expect(normalizeDisplayText("フリマ３", 100)).toBe("フリマ3");
    expect(normalizeDisplayText("収納ケース１２号", 100)).toBe("収納ケース12号");
    expect(normalizeIdentifier("００７", 100)).toBe("007");
    expect(normalizeJanCode("０１２３４５６７")).toBe("01234567");
    expect(normalizeJanInput("０００１２３４５")).toBe("00012345");
    // Identifiers stay strings: the leading zero must never be lost.
    expect(typeof normalizeIdentifier("００７", 100)).toBe("string");
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
