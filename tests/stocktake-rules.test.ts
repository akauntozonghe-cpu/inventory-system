import { describe, expect, it } from "vitest";
import {
  calculateEan13CheckDigit,
  canApplyStocktake,
  canCancelStocktake,
  canPauseStocktake,
  canRecordStocktake,
  canResumeStocktake,
  canSubmitStocktakeForReview,
  getStocktakeStatusLabel,
  isValidEan13,
  normalizeBarcode,
} from "../src/lib/stocktake-rules";

describe("棚卸状態の業務ルール", () => {
  it("作業中だけが棚卸入力できる", () => {
    expect(canRecordStocktake("IN_PROGRESS")).toBe(true);
    expect(canRecordStocktake("PAUSED")).toBe(false);
    expect(canRecordStocktake("REVIEW")).toBe(false);
    expect(canRecordStocktake("COMPLETED")).toBe(false);
  });

  it("中断中だけを再開できる", () => {
    expect(canResumeStocktake("PAUSED")).toBe(true);
    expect(canResumeStocktake("IN_PROGRESS")).toBe(false);
  });

  it("作業中だけを中断・確認待ちへ進められる", () => {
    expect(canPauseStocktake("IN_PROGRESS")).toBe(true);
    expect(canSubmitStocktakeForReview("IN_PROGRESS")).toBe(true);

    expect(canPauseStocktake("REVIEW")).toBe(false);
    expect(canSubmitStocktakeForReview("PAUSED")).toBe(false);
  });

  it("確認待ちだけを正式確定できる", () => {
    expect(canApplyStocktake("REVIEW")).toBe(true);
    expect(canApplyStocktake("IN_PROGRESS")).toBe(false);
    expect(canApplyStocktake("COMPLETED")).toBe(false);
  });

  it("完了済み・取消済みは取消できない", () => {
    expect(canCancelStocktake("IN_PROGRESS")).toBe(true);
    expect(canCancelStocktake("PAUSED")).toBe(true);
    expect(canCancelStocktake("REVIEW")).toBe(true);
    expect(canCancelStocktake("CONFLICT")).toBe(true);
    expect(canCancelStocktake("COMPLETED")).toBe(false);
    expect(canCancelStocktake("CANCELLED")).toBe(false);
  });

  it("状態ラベルを正しく表示できる", () => {
    expect(getStocktakeStatusLabel("IN_PROGRESS")).toBe("作業中");
    expect(getStocktakeStatusLabel("REVIEW")).toBe("確認待ち");
    expect(getStocktakeStatusLabel("COMPLETED")).toBe(
      "正式確定済み"
    );
  });
});

describe("バーコードの業務ルール", () => {
  it("空白・ハイフン・全角数字を正規化できる", () => {
    expect(normalizeBarcode("４９０-１３０１ ４０９６２１")).toBe(
      "4901301409621"
    );
  });

  it("EAN-13のチェックデジットを計算できる", () => {
    expect(calculateEan13CheckDigit("490130140962")).toBe("1");
  });

  it("正しいEAN-13を判定できる", () => {
    expect(isValidEan13("4901301409621")).toBe(true);
  });

  it("不正なEAN-13を拒否できる", () => {
    expect(isValidEan13("4901301409622")).toBe(false);
  });

  it("13桁以外はEAN-13として扱わない", () => {
    expect(isValidEan13("1043")).toBe(false);
    expect(isValidEan13("abc")).toBe(false);
  });
});