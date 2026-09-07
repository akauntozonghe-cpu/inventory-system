import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
async function setup(choice: Promise<{ outcome: "accepted" | "dismissed" }>, prompt = vi.fn(async () => {})) {
  const store = await import("../src/lib/pwa-install-prompt");
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: choice });
  store.captureInstallPrompt(event);
  return { store, event, prompt };
}
describe("端末への追加操作", () => {
  it("追加許可がない間は成功扱いにしない", async () => {
    const store = await import("../src/lib/pwa-install-prompt");
    await store.requestNativeInstall();
    expect(store.getInstallState()).toBe("waiting");
  });
  it("クリック内で直ちにpromptを呼び、連打しても一度だけ使う", async () => {
    const { store, prompt, event } = await setup(Promise.resolve({ outcome: "accepted" }));
    expect(event.defaultPrevented).toBe(true);
    const pending = store.requestNativeInstall();
    expect(prompt).toHaveBeenCalledTimes(1);
    await store.requestNativeInstall();
    await pending;
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(store.getInstallState()).toBe("accepted");
  });
  it("Chromeが無応答でも15秒で待機を終え、遅れた応答で上書きしない", async () => {
    let resolve!: (value: { outcome: "accepted" }) => void;
    const { store } = await setup(new Promise(r => { resolve = r; }));
    const pending = store.requestNativeInstall();
    await vi.advanceTimersByTimeAsync(15000);
    await pending;
    expect(store.getInstallState()).toBe("timeout");
    resolve({ outcome: "accepted" });
    await vi.runAllTimersAsync();
    expect(store.getInstallState()).toBe("timeout");
    store.markNativeInstalled();
    expect(store.getInstallState()).toBe("installed");
  });
  it("例外とキャンセルを区別する", async () => {
    const { store } = await setup(Promise.resolve({ outcome: "dismissed" }));
    await store.requestNativeInstall();
    expect(store.getInstallState()).toBe("dismissed");
    store.captureInstallPrompt(Object.assign(new Event("beforeinstallprompt"), { prompt: () => { throw new Error("unavailable"); }, userChoice: Promise.resolve({ outcome: "accepted" as const }) }));
    await store.requestNativeInstall();
    expect(store.getInstallState()).toBe("failed");
  });
});
