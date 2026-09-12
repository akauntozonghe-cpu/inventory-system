import { assessExpiry, dateKeyInJapan } from "./expiry-management";
import { expiryPolicy } from "./expiry-policy";
import { stockState, type LinkedStock } from "./stock-state";

export type BadgeStock = LinkedStock & { createdAt?: string | null; status?: string; expirationDate?: string | null; expirationManagementStatus?: string; expirationAlertDays?: number };
export type InventoryBadge = { key: string; label: string; tone: "red" | "orange" | "amber" | "green" | "violet" | "slate"; detail: string };
export const NEW_ITEM_DAYS = 7;
export function inventoryBadges(item: { createdAt?: string | null; isArchived?: boolean }, stocks: BadgeStock[], now: number): InventoryBadge[] {
  if (item.isArchived || !Number.isFinite(now) || now <= 0) return [];
  const active = stocks.filter(stock => stock.status !== "廃止");
  const badges: InventoryBadge[] = [];
  const counts = new Map<string, number>();
  for (const stock of active) {
    if (stock.quantity <= 0 || expiryPolicy(stock.expirationDate, stock.expirationManagementStatus ?? "ACTIVE") !== "MANAGED") continue;
    const assessment = assessExpiry(stock.expirationDate, stock.expirationAlertDays ?? 30, dateKeyInJapan(new Date(now)));
    const key = assessment.level === "EXPIRED" ? "expired" : assessment.level === "TODAY" ? "today" : ["CRITICAL", "WARNING"].includes(assessment.level) ? "near" : null;
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, label, tone] of [["expired", "期限切れ", "red"], ["today", "本日期限", "orange"], ["near", "期限間近", "amber"]] as const) {
    const count = counts.get(key);
    if (count) badges.push({ key, label, tone, detail: count + "件の在庫・ロットが該当します。期限間近は各在庫の通知日数（標準30日前）に従います。" });
  }
  const recent = (date: string | null | undefined) => { const age = date ? now - Date.parse(date) : NaN; return Number.isFinite(age) && age >= 0 && age < NEW_ITEM_DAYS * 86400000; };
  if (recent(item.createdAt) || active.some(stock => recent(stock.createdAt))) badges.push({ key: "new", label: "新規", tone: "green", detail: "商品または在庫・ロットを登録してから7日間表示します。編集だけでは新規になりません。" });
  const states = active.map(stockState);
  if (states.some(s => s.preparing > 0)) badges.push({ key: "preparing", label: "フリマ準備中", tone: "violet", detail: "出品準備・出品待ちの在庫があります。" });
  if (states.some(s => s.listed > 0)) badges.push({ key: "listed", label: "フリマ出品中", tone: "violet", detail: "出品中の在庫があります。" });
  if (states.some(s => s.shipping > 0)) badges.push({ key: "shipping", label: "売却済み・発送待ち", tone: "orange", detail: "売却済みで発送が終わっていない商品があります。" });
  if (states.some(s => s.unlistedAllocation)) badges.push({ key: "allocation", label: "フリマ用", tone: "violet", detail: "フリマ用に指定されています。出品は未登録です。" });
  if (active.length && active.every(stock => stock.quantity <= 0)) badges.push({ key: "empty", label: "在庫なし", tone: "slate", detail: "登録在庫がありません。" });
  return badges;
}
