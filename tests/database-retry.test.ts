import { describe, expect, it, vi } from "vitest";
import { withDatabaseRetry } from "../src/lib/database-retry";

describe("database retry", () => {
  it("通常処理は一度で完了する", async () => {
    const operation = vi.fn().mockResolvedValue("ok");
    await expect(withDatabaseRetry(operation)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("業務エラーは再試行しない", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("VALIDATION_ERROR"));
    await expect(withDatabaseRetry(operation)).rejects.toThrow("VALIDATION_ERROR");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
