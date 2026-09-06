import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeLoginInstallNotice, hasRelatedPwa, isPwaRemembered, markLoginForInstallNotice, rememberPwaInstalled, shouldOfferPwaInstall } from "../src/lib/pwa-install";
function storage() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => map.set(key, value), removeItem: (key: string) => map.delete(key) };
}
describe("login PWA installation notice", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", storage()); vi.stubGlobal("sessionStorage", storage());
    vi.stubGlobal("window", { location: { origin: "https://inventory.example" } });
    vi.stubGlobal("navigator", {});
    rememberPwaInstalled(false); consumeLoginInstallNotice();
  });
  afterEach(() => vi.unstubAllGlobals());
  const unknown = { standalone: false, installable: false, relatedInstalled: false, remembered: false };
  it("offers installation when no installation is known, including Safari without an install prompt", () => expect(shouldOfferPwaInstall(unknown)).toBe(true));
  it.each(["standalone", "relatedInstalled", "remembered"] as const)("suppresses the login notice when %s", key => expect(shouldOfferPwaInstall({ ...unknown, [key]: true })).toBe(false));
  it("offers installation again after the browser detects that a previously installed app was removed", () => expect(shouldOfferPwaInstall({ ...unknown, remembered: true, installable: true })).toBe(true));
  it("notifies once after each successful login, not on every page navigation", () => {
    expect(consumeLoginInstallNotice()).toBe(false);
    markLoginForInstallNotice(); expect(consumeLoginInstallNotice()).toBe(true); expect(consumeLoginInstallNotice()).toBe(false);
    markLoginForInstallNotice(); expect(consumeLoginInstallNotice()).toBe(true);
  });
  it("remembers installation on this browser, without reusing the old permanent dismissal", () => {
    localStorage.setItem("pwa-guide-dismissed", "yes"); expect(isPwaRemembered()).toBe(false);
    rememberPwaInstalled(true); expect(isPwaRemembered()).toBe(true);
    rememberPwaInstalled(false); expect(isPwaRemembered()).toBe(false);
  });
  it("continues to work when browser storage is blocked", () => {
    vi.stubGlobal("sessionStorage", { setItem() { throw Error(); }, getItem() { throw Error(); } });
    markLoginForInstallNotice(); expect(consumeLoginInstallNotice()).toBe(true); expect(consumeLoginInstallNotice()).toBe(false);
  });
  it("only accepts the installed PWA for this origin and manifest", async () => {
    vi.stubGlobal("navigator", { getInstalledRelatedApps: async () => [{ platform: "webapp", url: "https://other.example/manifest.webmanifest" }] });
    expect(await hasRelatedPwa()).toBe(false);
    vi.stubGlobal("navigator", { getInstalledRelatedApps: async () => [{ platform: "webapp", url: "https://inventory.example/manifest.webmanifest" }] });
    expect(await hasRelatedPwa()).toBe(true);
  });
  it("falls back gracefully when related-app detection is unavailable or denied", async () => {
    expect(await hasRelatedPwa()).toBe(false);
    vi.stubGlobal("navigator", { getInstalledRelatedApps: async () => { throw Error(); } });
    expect(await hasRelatedPwa()).toBe(false);
  });
});
