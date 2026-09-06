const INSTALLED_KEY = "inventory-pwa-installed";
const LOGIN_KEY = "inventory-pwa-login-notice";
let pendingLogin = false;
let remembered = false;

export function markLoginForInstallNotice() {
  pendingLogin = true;
  try { sessionStorage.setItem(LOGIN_KEY, "pending"); } catch { /* In-memory fallback. */ }
}
export function consumeLoginInstallNotice() {
  let pending = pendingLogin;
  try { pending ||= sessionStorage.getItem(LOGIN_KEY) === "pending"; sessionStorage.removeItem(LOGIN_KEY); } catch {}
  pendingLogin = false;
  return pending;
}
export function rememberPwaInstalled(installed: boolean) {
  remembered = installed;
  try { if (installed) localStorage.setItem(INSTALLED_KEY, "yes"); else localStorage.removeItem(INSTALLED_KEY); } catch {}
}
export function isPwaRemembered() {
  try { return localStorage.getItem(INSTALLED_KEY) === "yes"; } catch { return remembered; }
}
export function isStandalonePwa() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}
export function shouldOfferPwaInstall(state: { standalone: boolean; installable: boolean; relatedInstalled: boolean; remembered: boolean }) {
  if (state.standalone || state.relatedInstalled) return false;
  // A new browser install event also detects removal of a previously installed app.
  return state.installable || !state.remembered;
}
export async function hasRelatedPwa() {
  const getApps = (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<Array<{ platform: string; url?: string; id?: string }>> }).getInstalledRelatedApps;
  if (!getApps) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const apps = await Promise.race([getApps.call(navigator), new Promise<[]>(resolve => { timer = setTimeout(() => resolve([]), 1200); })]);
    return apps.some(app => {
      if (app.platform !== "webapp" || !app.url) return false;
      const url = new URL(app.url, window.location.origin);
      return url.origin === window.location.origin && url.pathname === "/manifest.webmanifest";
    });
  } catch { return false; }
  finally { clearTimeout(timer); }
}
export function pwaInstallInstructions() {
  if (!window.isSecureContext) return "HTTPSの公開URLで開いてください。HTTPのローカルIPアドレスではアプリとして追加できません。";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios
    ? "Safariでこのサイトを開き、共有ボタン →「ホーム画面に追加」→「追加」を押してください。「Webアプリとして開く」が表示される場合はONにします。"
    : "ChromeまたはEdgeのメニュー →「アプリをインストール」または「ホーム画面に追加」を選んでください。項目がなければ、アプリ内ブラウザではなくChrome・EdgeでこのURLを開いてください。";
}
