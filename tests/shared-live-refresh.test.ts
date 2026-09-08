import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeLiveRefresh } from "../src/lib/shared-live-refresh";

describe("shared refresh subscriptions", () => {
  const stops: Array<() => void> = [];
  let revision: string;
  let request: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
    revision = "one";
    request = vi.fn(async () => Response.json({ revision }));
    vi.stubGlobal("fetch", request);
  });
  afterEach(() => { stops.splice(0).forEach((stop) => stop()); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("checks once per tab and refreshes every dependent component only when data changes", async () => {
    const views = Array.from({ length: 12 }, () => vi.fn(async () => {}));
    views.forEach((view) => stops.push(subscribeLiveRefresh(view, vi.fn())));
    await vi.advanceTimersByTimeAsync(1000);
    expect(request).toHaveBeenCalledTimes(1);
    views.forEach((view) => expect(view).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(request).toHaveBeenCalledTimes(2);
    views.forEach((view) => expect(view).toHaveBeenCalledTimes(1));
    revision = "two";
    await vi.advanceTimersByTimeAsync(1000);
    views.forEach((view) => expect(view).toHaveBeenCalledTimes(2));
  });
  it("retries a failed view while retaining successful views at the current revision", async () => {
    const bad = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const good = vi.fn(async () => {}), failed = vi.fn();
    stops.push(subscribeLiveRefresh(bad, failed), subscribeLiveRefresh(good, vi.fn()));
    await vi.advanceTimersByTimeAsync(2000);
    expect(bad).toHaveBeenCalledTimes(2);
    expect(good).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(1);
  });
  it("clears a network failure by reloading even if the revision did not change", async () => {
    const view = vi.fn(async () => {}), failed = vi.fn();
    stops.push(subscribeLiveRefresh(view, failed));
    await vi.advanceTimersByTimeAsync(1000);
    request.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"));
    await vi.advanceTimersByTimeAsync(3000);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(view).toHaveBeenCalledTimes(2);
  });
});
