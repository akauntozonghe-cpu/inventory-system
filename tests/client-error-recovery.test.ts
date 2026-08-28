import { afterEach, describe, expect, it, vi } from "vitest";
import { recoverAfterFailure } from "../src/lib/client-error-recovery";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

function installBrowserMocks(reportId = "report-001") {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setTimeout, clearTimeout },
  });

  const actions: string[] = [];
  globalThis.fetch = vi.fn(async (input, init) => {
    const url = String(input);
    if (url === "/api/error-reports") {
      return new Response(JSON.stringify({ success: true, reportId }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string };
    if (body.action) actions.push(body.action);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return actions;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
  vi.restoreAllMocks();
});

describe("recoverAfterFailure", () => {
  it("一時エラーなら再試行し、自動復旧完了を記録する", async () => {
    const actions = installBrowserMocks();
    const action = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue("saved");
    const result = await recoverAfterFailure({
      code: "STOCKTAKE_TEST_ERROR",
      title: "棚卸テスト",
      message: "一時エラー",
      action,
      maxRetries: 2,
      retryDelayMs: 0,
    });
    expect(result).toEqual({ success: true, value: "saved", reportId: "report-001" });
    expect(action).toHaveBeenCalledTimes(2);
    expect(actions).toEqual(["START_AUTO_RECOVERY", "AUTO_RECOVERY_SUCCEEDED"]);
  });

  it("再試行を使い切ったら管理者対応待ちを記録する", async () => {
    const actions = installBrowserMocks("report-002");
    const action = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("down"));
    const result = await recoverAfterFailure({
      code: "STOCKTAKE_TEST_DOWN",
      title: "棚卸テスト",
      message: "継続エラー",
      action,
      maxRetries: 2,
      retryDelayMs: 0,
    });
    expect(result).toEqual({ success: false, reportId: "report-002" });
    expect(action).toHaveBeenCalledTimes(3);
    expect(actions).toEqual(["START_AUTO_RECOVERY", "ADMIN_REQUIRED"]);
  });
});
