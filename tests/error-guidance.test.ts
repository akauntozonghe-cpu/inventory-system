import { describe, expect, it } from "vitest";
import { extractErrorCode, getErrorGuidance } from "../src/lib/error-guidance";

describe("error guidance", () => {
  it("API形式と画面形式からエラーコードを抽出する", () => {
    expect(extractErrorCode("MARKETPLACE_LIST_FAILED: 取得失敗")).toBe("MARKETPLACE_LIST_FAILED");
    expect(extractErrorCode("取得失敗（エラーコード：DB_SCHEMA_P2022）")).toBe("DB_SCHEMA_P2022");
  });

  it("利用者の対応と認証後の復旧手順を必ず返す", () => {
    const guidance = getErrorGuidance("MARKETPLACE_SCHEMA_NOT_READY");
    expect(guidance.action).toContain("自動再取得");
    expect(guidance.adminSteps.length).toBeGreaterThanOrEqual(4);
    expect(guidance.recoveryRoute).toBe("/admin/system-check");
  });
});
