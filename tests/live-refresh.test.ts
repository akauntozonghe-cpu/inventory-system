import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startLiveRefresh } from "../src/lib/live-refresh";

describe("multi-device refresh", () => {
  let page: EventTarget & { visibilityState: string };
  let browser: EventTarget;
  beforeEach(() => {
    vi.useFakeTimers();
    page = Object.assign(new EventTarget(), { visibilityState: "visible" });
    browser = new EventTarget();
    vi.stubGlobal("document", page);
    vi.stubGlobal("window", browser);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("waits for a slow request and does not overlap focus, online or timer refreshes", async () => {
    let finish!: () => void;
    const refresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const stop = startLiveRefresh(refresh, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    browser.dispatchEvent(new Event("focus"));
    browser.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
    stop(); finish();
  });

  it("refreshes immediately on returning to a hidden tab and removes listeners on stop", async () => {
    const refresh = vi.fn(async () => {});
    page.visibilityState = "hidden";
    const stop = startLiveRefresh(refresh, vi.fn());
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).not.toHaveBeenCalled();
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledOnce();
    stop();
    browser.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("reports a failed refresh and retries automatically", async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const fail = vi.fn();
    const stop = startLiveRefresh(refresh, fail);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fail).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledTimes(2);
    stop();
  });
});
