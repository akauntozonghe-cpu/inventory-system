import { requiredFeatures, type FeatureKey } from "./feature-permissions";
export type AppUserAccess = { id: string; displayName: string; role: string; featurePermissions: string[] };
export function canUseFeature(user: AppUserAccess | null, feature: FeatureKey) {
  if (!user) return false;
  const features = feature === "MARKETPLACE_SETTINGS" ? ["MARKETPLACE", feature] : feature === "STOCKTAKE_START" ? ["STOCKTAKE", feature] : [feature];
  return user.role === "ADMIN" || features.every(key => user.featurePermissions.includes(key));
}
export function canVisit(user: AppUserAccess | null, href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) return true;
  const pathname = href.split(/[?#]/)[0];
  if (["/", "/login", "/install", "/setup", "/offline"].includes(pathname)) return true;
  if (!user) return false;
  if (((pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) && !pathname.startsWith("/admin/marketplace") && !pathname.startsWith("/api/admin/marketplace")) || ["/add", "/import", "/reset", "/export", "/api/export", "/api/import"].includes(pathname)) return user.role === "ADMIN";
  return requiredFeatures(pathname, "GET").every(feature => canUseFeature(user, feature));
}
