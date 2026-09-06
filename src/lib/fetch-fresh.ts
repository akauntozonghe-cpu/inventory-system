/** A stalled connection must not stop all subsequent live refreshes. */
export async function fetchFresh(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const cancel = () => controller.abort();
  init.signal?.addEventListener("abort", cancel, { once: true });
  if (init.signal?.aborted) controller.abort();
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    await response.clone().arrayBuffer();
    return response;
  }
  finally { clearTimeout(timer); init.signal?.removeEventListener("abort", cancel); }
}
