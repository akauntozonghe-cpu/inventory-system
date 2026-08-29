import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { maybeRunScheduledSystemCheck } from "@/lib/scheduled-system-check";

export async function GET() {
  try {
    const setting = await prisma.systemOperationSetting.findUnique({ where: { id: "system" } });
    await maybeRunScheduledSystemCheck(setting?.autoCheckIntervalMinutes ?? 360).catch((error) => {
      console.error("SCHEDULED_SYSTEM_CHECK_FAILED", error);
    });
    return NextResponse.json({ mode: setting?.mode ?? "NORMAL", message: setting?.message ?? null, updatedAt: setting?.updatedAt ?? null });
  } catch (error) {
    console.error("SYSTEM_STATUS_DATABASE_UNAVAILABLE", error);
    return NextResponse.json({ mode: "MAINTENANCE", message: "データベース接続を自動復旧中です。安全確認後に通常画面へ戻ります。", updatedAt: null, degraded: true });
  }
}
