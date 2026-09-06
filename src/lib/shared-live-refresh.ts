import { startLiveRefresh } from "./live-refresh";
import { fetchFresh } from "./fetch-fresh";
type Subscriber = { refresh: () => Promise<unknown>; failed: () => void; revision: string | null };
const subscribers = new Set<Subscriber>();
let stop: (() => void) | undefined;

// One revision request per tab, regardless of the number of mounted views.
export function subscribeLiveRefresh(refresh: () => Promise<unknown>, failed: () => void) {
  const subscriber = { refresh, failed, revision: null as string | null };
  subscribers.add(subscriber);
  if (!stop) stop = startLiveRefresh(async () => {
    const response = await fetchFresh("/api/sync/revision");
    if (!response.ok) throw new Error("更新確認失敗");
    const data = await response.json();
    if (typeof data.revision !== "string") throw new Error("更新情報不正");
    await Promise.allSettled([...subscribers].map(async (entry) => {
      if (entry.revision === data.revision) return;
      try { await entry.refresh(); entry.revision = data.revision; }
      catch { entry.failed(); }
    }));
  }, () => { for (const entry of subscribers) { entry.revision = null; entry.failed(); } });
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) { stop?.(); stop = undefined; }
  };
}
