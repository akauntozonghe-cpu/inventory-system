import { describe, expect, it } from "vitest";
import { duplicateScore } from "../src/lib/duplicate-detection";

describe("duplicateScore", () => {
  it("JANの空白・ハイフン差を無視して同一候補にする", () => {
    const result = duplicateScore(
      { janCode: "490-1234 567890" },
      { janCode: "4901234567890" }
    );
    expect(result.likelyDuplicate).toBe(true);
    expect(result.reasons).toContain("JAN一致");
  });

  it("商品名だけの完全一致も候補として警告する", () => {
    expect(duplicateScore({ name: " テスト商品 " }, { name: "テスト商品" }).likelyDuplicate).toBe(true);
  });

  it("商品名・メーカー・Lot・場所の複合一致を高く評価する", () => {
    const result = duplicateScore(
      { name: "商品A", manufacturer: "会社", lotNo: "L01", storageLocationId: "s1" },
      { name: "商品Ａ", manufacturer: "会社", lotNo: "L01", storageLocationId: "s1" }
    );
    expect(result.score).toBe(100);
    expect(result.reasons).toEqual(["商品名一致", "メーカー一致", "ロット一致", "保管場所一致"]);
  });
});
