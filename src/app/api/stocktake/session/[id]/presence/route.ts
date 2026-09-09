import { NextRequest, NextResponse } from "next/server";
import { requireLogin, hasAdminAccess } from "@/lib/auth";
import { updatePresence } from "@/lib/stocktake-presence";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireLogin(request); if (auth.response || !auth.user) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.deviceId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(body.deviceId) || !["HEARTBEAT", "LEAVE"].includes(body.action)) return NextResponse.json({ code: "PRESENCE_INVALID", message: "端末情報を確認できませんでした。" }, { status: 400 });
  try {
    const value = await updatePresence((await params).id, body.deviceId, auth.user.id, hasAdminAccess(request), body.action === "LEAVE");
    return NextResponse.json(value, { status: value.status, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ code: "PRESENCE_FAILED", message: "作業端末の状態を更新できませんでした。" }, { status: 503 }); }
}
