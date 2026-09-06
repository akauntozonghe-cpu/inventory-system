export type ExpiryPolicy = "UNSET" | "MANAGED" | "NO_EXPIRY";
export function expiryPolicy(date: string | null | undefined, status: string): ExpiryPolicy {
  if (status === "NO_EXPIRY") return "NO_EXPIRY";
  if (status === "UNSET") return "UNSET";
  if (date || ["MANAGED", "ACKNOWLEDGED", "RESOLVED"].includes(status)) return "MANAGED";
  return "UNSET";
}
export const expiryPolicyLabels: Record<ExpiryPolicy, string> = { UNSET: "未設定", MANAGED: "管理対象", NO_EXPIRY: "対応不要" };
export function matchesExpiryFilter(entry: { expirationDate: string | null; expirationManagementStatus: string; assessment: { level: string } }, filter: string) {
  const policy = expiryPolicy(entry.expirationDate, entry.expirationManagementStatus);
  if (filter === "ALL") return true;
  if (["UNSET", "NONE"].includes(filter)) return policy === "UNSET";
  if (filter === "NO_EXPIRY" || filter === "MANAGED") return policy === filter;
  if (policy !== "MANAGED") return false;
  if (filter === "ACTION") return ["EXPIRED", "TODAY", "CRITICAL", "WARNING", "INVALID", "NONE"].includes(entry.assessment.level) && entry.expirationManagementStatus !== "RESOLVED";
  return filter === entry.assessment.level || filter === entry.expirationManagementStatus;
}
