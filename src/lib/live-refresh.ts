/** Serial refresh loop: slow connections never accumulate overlapping polls. */
export function startLiveRefresh(refresh: () => Promise<unknown>, onFailure: () => void, interval = 1000) {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (stopped || running || document.visibilityState === "hidden") return;
    clearTimeout(timer);
    running = true;
    try { await refresh(); } catch { if (!stopped) onFailure(); }
    finally {
      running = false;
      if (!stopped) timer = setTimeout(() => void run(), interval);
    }
  };
  const wake = () => { void run(); };
  window.addEventListener("focus", wake);
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", wake);
  timer = setTimeout(wake, interval);
  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener("focus", wake);
    window.removeEventListener("online", wake);
    document.removeEventListener("visibilitychange", wake);
  };
}
