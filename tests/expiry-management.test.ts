import { describe, expect, it } from "vitest";
import { assessExpiry } from "../src/lib/expiry-management";

describe("expiry management", () => {
  const today = "2026-08-31";

  it("期限切れ・本日・7日以内・通知期間を正しく分類する", () => {
    expect(assessExpiry("2026-08-30", 30, today).level).toBe("EXPIRED");
    expect(assessExpiry("2026-08-31", 30, today).level).toBe("TODAY");
    expect(assessExpiry("2026-09-07", 30, today).level).toBe("CRITICAL");
    expect(assessExpiry("2026-09-30", 30, today).level).toBe("WARNING");
  });

  it("存在しない日付を異常として検出する", () => {
    const result = assessExpiry("2026-02-30", 30, today);
    expect(result.level).toBe("INVALID");
    expect(result.action).toContain("修正");
  });

  it("期限切れには具体的な対応を返す", () => {
    const result = assessExpiry("2026-07-01", 30, today);
    expect(result.daysRemaining).toBeLessThan(0);
    expect(result.action).toContain("廃棄");
  });
});
