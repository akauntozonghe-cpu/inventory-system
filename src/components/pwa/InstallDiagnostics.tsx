"use client";
import { useState } from "react";
import { fetchFresh } from "@/lib/fetch-fresh";
import { isStandalonePwa } from "@/lib/pwa-install";

export default function InstallDiagnostics() {
  const [checks, setChecks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const check = async () => {
    setBusy(true);
    const results = [isStandalonePwa() ? "アプリとして起動済みです。" : "ブラウザから開いています。"];
    results.push(window.isSecureContext ? "安全な接続：確認できました。" : "HTTPSの公開URLで開き直してください。現在の接続ではPWAを準備できません。");
    results.push(navigator.onLine ? "端末はオンラインです。" : "オフラインです。通信が戻ってから再確認してください。");
    try {
      const response = await fetchFresh("/manifest.webmanifest");
      if (!response.ok) throw new Error();
      const manifest = await response.json() as { icons?: { src: string }[] };
      if (!manifest.icons?.length) throw new Error();
      const icons = await Promise.all(manifest.icons.map(async icon => {
        const url = new URL(icon.src, window.location.origin);
        if (url.origin !== window.location.origin) return false;
        const image = await fetchFresh(url.href);
        return image.ok && image.headers.get("content-type")?.startsWith("image/");
      }));
      results.push(icons.every(Boolean) ? "アプリ情報とアイコン：取得できました。" : "アイコンを取得できません。通信を確認して再チェックしてください。");
    } catch { results.push("アプリ情報を取得できません。通信を確認して再チェックしてください。"); }
    try {
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/") : undefined;
      results.push(registration?.active ? "アプリの起動準備：完了しています。" : "アプリの起動準備：未完了です。HTTPSと通信を確認してページを開き直してください。");
    } catch { results.push("アプリの準備状況を取得できません。Chromeの通常タブで開き直してください。"); }
    setChecks(results);
    setBusy(false);
  };
  return <details className="mt-4 rounded-xl border p-4">
    <summary className="cursor-pointer font-bold">追加できない場合（Pixel・Androidなど）</summary>
    <ol className="my-3 list-decimal space-y-2 pl-5 text-sm">
      <li>Pixel 9 ProはChromeの通常タブでこのサイトを直接開いてください。LINEやGoogleアプリ内で開いている場合は、URLをコピーしてChromeで開き直します。</li>
      <li>Chrome右上の「︙」→「ホーム画面に追加」→「インストール」を選びます。表示名が「アプリをインストール」の場合もあります。</li>
      <li>追加後にホーム画面で見つからない場合は、アプリ一覧で「在庫管理」または「Inventory OS」を探してください。</li>
      <li>項目が出ない場合はChromeを更新し、通常タブで開き直してください。端末や組織の制限によって追加できない場合もあります。</li>
    </ol>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy} onClick={() => void check()} className="rounded-xl border px-4 py-3 font-bold">{busy ? "確認中…" : "この端末の状態を確認"}</button>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(window.location.origin).then(() => setCopyMessage("URLをコピーしました。Chromeのアドレス欄に貼り付けてください。")).catch(() => setCopyMessage(`このURLをChromeで開いてください：${window.location.origin}`)); if (!navigator.clipboard) setCopyMessage(`このURLをChromeで開いてください：${window.location.origin}`); }} className="rounded-xl border px-4 py-3 font-bold">Chromeで開くためのURLをコピー</button>
    </div>
    {copyMessage && <p role="status" className="mt-3 break-all text-sm">{copyMessage}</p>}
    {checks.length > 0 && <ul role="status" className="mt-3 space-y-2 text-sm">{checks.map(result => <li key={result}>{result}</li>)}</ul>}
    <p className="mt-3 text-sm text-slate-600">状態が正常でも、追加画面の表示はブラウザが決めます。iPhone・iPadはSafariの共有メニュー、PCはChrome・Edgeのインストールメニューを使ってください。</p>
  </details>;
}
