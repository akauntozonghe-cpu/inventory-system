import { displayActionLabel } from "./display-labels";
export type Activity = {
  date: string;
  summary: { registeredItems: number; stocktakeRecords: number; inventoryEvents: number; adminActions: number };
  items: Array<{ id: string; name: string; janCode: string | null; systemBarcode: string | null; createdAt: string }>;
  records: Array<{ id: string; countedQuantity: number; updatedAt: string; session: { id: string; title: string; operator: string | null }; inventoryInstance: { item: { name: string } } }>;
  inventoryEvents: Array<{ id: string; eventType: string; quantityChange: number; quantityAfter: number; reason: string | null; createdAt: string; performedBy: { displayName: string } | null; inventoryInstance: { item: { name: string } } }>;
  adminActions: Array<{ id: string; action: string; route: string | null; createdAt: string; adminUser: { displayName: string } }>;
};
export type JournalRow = { id: string; at: string; kind: string; subject: string; detail: string; operator: string; href: string | null };
export function journalRows(activity: Activity): JournalRow[] {
  return [
    ...activity.items.map(item => ({ id: "i-" + item.id, at: item.createdAt, kind: "商品登録", subject: item.name, detail: item.janCode || item.systemBarcode || "コードなし", operator: "—", href: "/items/" + item.id })),
    ...activity.records.map(record => ({ id: "r-" + record.id, at: record.updatedAt, kind: "棚卸入力", subject: record.inventoryInstance.item.name, detail: "実数 " + record.countedQuantity + " ／ " + record.session.title, operator: record.session.operator || "未設定", href: "/stocktake/" + record.session.id })),
    ...activity.inventoryEvents.map(event => ({ id: "e-" + event.id, at: event.createdAt, kind: "在庫変更", subject: event.inventoryInstance.item.name, detail: displayActionLabel(event.eventType) + " ／ 増減 " + (event.quantityChange >= 0 ? "+" : "") + event.quantityChange + " → " + event.quantityAfter + (event.reason ? " ／ " + event.reason : ""), operator: event.performedBy?.displayName || "システム", href: null })),
    ...activity.adminActions.map(entry => ({ id: "a-" + entry.id, at: entry.createdAt, kind: "管理操作", subject: displayActionLabel(entry.action), detail: "", operator: entry.adminUser.displayName, href: null })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
export function journalTime(value: string) {
  return new Date(value).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}
