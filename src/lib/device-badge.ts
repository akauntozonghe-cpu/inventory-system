export async function updateDeviceBadge(unreadCount: number) {
  const badge = navigator as Navigator & { setAppBadge?: (count?:number)=>Promise<void>; clearAppBadge?:()=>Promise<void> };
  try { if(unreadCount>0)await badge.setAppBadge?.(unreadCount);else await badge.clearAppBadge?.(); } catch { /* Badging is optional; the header badge remains available. */ }
}
