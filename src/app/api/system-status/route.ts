import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const setting = await prisma.systemOperationSetting.findUnique({ where: { id: "system" } });
  return NextResponse.json({
    mode: setting?.mode ?? "NORMAL",
    message: setting?.message ?? null,
    updatedAt: setting?.updatedAt ?? null,
  });
}
