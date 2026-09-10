import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(request: NextRequest) { const auth = requireLogin(request); if (auth.response || !auth.user)
    return auth.response; const user = await prisma.appUser.findUnique({ where: { id: auth.user.id }, select: { role: true, isActive: true, featurePermissions: true } }); if (!user?.isActive || (user.role !== "ADMIN" && !user.featurePermissions.includes("LABEL_PRINT" as never)))
    return NextResponse.json({ code: "PRINT_NOT_ALLOWED", message: "このアカウントではラベル印刷が許可されていません。ユーザー管理の印刷設定を確認してください。" }, { status: 403 }); return NextResponse.json({ allowed: true }, { headers: { "Cache-Control": "no-store" } }); }
