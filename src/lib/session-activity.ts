export const ACTIVITY_KEY = "inventory:last-activity";
export function resetSessionActivity() {
  try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch { /* Storage may be unavailable in private mode. */ }
}
