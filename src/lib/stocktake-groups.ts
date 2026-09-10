export type StocktakeGroup = "ACTIVE" | "ISSUES" | "COMPLETED" | "ALL";
export const stocktakeGroups: { value: StocktakeGroup; label: string }[] = [
  { value: "ACTIVE", label: "棚卸中・中断" },
  { value: "ISSUES", label: "確認待ち・再開確認待ち" },
  { value: "COMPLETED", label: "完了・取消" },
  { value: "ALL", label: "すべて" },
];
export function matchesStocktakeGroup(status: string, group: StocktakeGroup) {
  if (group === "ALL") return true;
  if (group === "ACTIVE") return status === "IN_PROGRESS" || status === "PAUSED";
  if (group === "ISSUES") return status === "REVIEW" || status === "CONFLICT";
  return status === "COMPLETED" || status === "CANCELLED";
}
