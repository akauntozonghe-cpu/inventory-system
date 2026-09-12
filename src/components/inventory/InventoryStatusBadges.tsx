"use client";
import { useSyncExternalStore } from "react";
import { inventoryBadges, type BadgeStock } from "@/lib/inventory-badges";

// Share one clock across every card; resume updates after a backgrounded tab.
let currentTime = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function tick() { currentTime = Date.now(); listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) { tick(); timer = setInterval(tick, 60000); window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick); }
  return () => { listeners.delete(listener); if (!listeners.size) { clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); } };
}
const snapshot = () => currentTime;
const serverSnapshot = () => 0;
const colors = { red: "bg-red-100 text-red-800 ring-red-200", orange: "bg-orange-100 text-orange-900 ring-orange-200", amber: "bg-amber-100 text-amber-900 ring-amber-200", green: "bg-emerald-100 text-emerald-800 ring-emerald-200", violet: "bg-violet-100 text-violet-800 ring-violet-200", slate: "bg-slate-100 text-slate-700 ring-slate-200" };
export default function InventoryStatusBadges({ item = {}, stocks }: { item?: { createdAt?: string | null; isArchived?: boolean }; stocks: BadgeStock[] }) {
  const now = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const badges = inventoryBadges(item, stocks, now);
  if (!badges.length) return null;
  return <div aria-label="商品・在庫のステータス" className="my-2 flex flex-wrap gap-2">{badges.map(badge => <span key={badge.key} title={badge.detail} className={"inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset " + colors[badge.tone]}>{badge.label}</span>)}</div>;
}
