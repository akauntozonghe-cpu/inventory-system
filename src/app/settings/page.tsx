import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";

// Keep old bookmarks working without maintaining a second settings menu.
export default async function SettingsPage() {
  const user = verifySessionToken((await cookies()).get(AUTH_COOKIE)?.value);
  if (!user) redirect("/login");
  redirect(user.role === "ADMIN" ? "/admin" : "/account/password");
}
