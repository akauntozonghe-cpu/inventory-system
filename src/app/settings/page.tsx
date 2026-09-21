import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, ADMIN_ELEVATION_COOKIE, effectiveSessionUser } from "@/lib/auth";

// Keep old bookmarks working without maintaining a second settings menu.
export default async function SettingsPage() {
  const user = effectiveSessionUser((await cookies()).get(AUTH_COOKIE)?.value,(await cookies()).get(ADMIN_ELEVATION_COOKIE)?.value);
  if (!user) redirect("/login");
  redirect(user.role === "ADMIN" ? "/admin" : "/account/password");
}
