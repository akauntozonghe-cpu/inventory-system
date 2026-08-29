import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MODES = ["NORMAL", "TEST", "MAINTENANCE"] as const;
const CHECK_INTERVALS = [60, 360, 1440] as const;

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const setting = await prisma.systemOperationSetting.findUnique({ where: { id: "system" } });
  return NextResponse.json(setting ?? { id: "system", mode: "NORMAL", message: null });
}

export async function PATCH(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null) as { mode?: unknown; message?: unknown; autoCheckIntervalMinutes?: unknown } | null;
  if (!body || typeof body.mode !== "string" || !MODES.includes(body.mode as typeof MODES[number])) {
    return NextResponse.json({ code: "OPERATION_MODE_INVALID_400", message: "運用モードが正しくありません。" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 300) || null : null;
  const autoCheckIntervalMinutes = typeof body.autoCheckIntervalMinutes === "number" && CHECK_INTERVALS.includes(body.autoCheckIntervalMinutes as typeof CHECK_INTERVALS[number])
    ? body.autoCheckIntervalMinutes
    : 360;
  const setting = await prisma.systemOperationSetting.upsert({
    where: { id: "system" },
    create: { id: "system", mode: body.mode, message, autoCheckIntervalMinutes, updatedByUserId: auth.user!.id },
    update: { mode: body.mode, message, autoCheckIntervalMinutes, updatedByUserId: auth.user!.id },
  });
  await prisma.adminActionLog.create({
    data: { adminUserId: auth.user!.id, action: "SYSTEM_OPERATION_MODE_UPDATE", route: "/admin/operation-mode", detail: { mode: body.mode, message, autoCheckIntervalMinutes } },
  });
  return NextResponse.json({ setting, message: "運用モードを更新しました。" });
}
