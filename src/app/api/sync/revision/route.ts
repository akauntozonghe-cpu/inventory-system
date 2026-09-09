import { scheduleDeviceNotifications } from "@/lib/device-push";
import { expireStocktakePresence } from "@/lib/stocktake-presence";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireLogin } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  scheduleDeviceNotifications(false);
  const auth = requireLogin(request);
  if (auth.response) return auth.response;
  try {
    await expireStocktakePresence();
    // MVCC snapshot changes when a writing transaction commits, even when its
    // updatedAt predates another transaction. This avoids table scans and the
    // missed-commit race of MAX(updatedAt). All readers use the same primary DB.
    const rows = await prisma.$queryRaw<Array<{ snapshot: string }>>`SELECT txid_current_snapshot()::text AS snapshot`;
    if (!rows[0]?.snapshot) throw new Error("Missing database snapshot");
    const revision = createHash("sha256").update(`${rows[0].snapshot}:${Math.floor(Date.now() / 60000)}`).digest("hex");
    return NextResponse.json({ revision }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ message: "更新確認に失敗しました。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
