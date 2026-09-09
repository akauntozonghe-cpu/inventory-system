import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { canReopenStocktake } from "@/lib/stocktake-reopening";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const reason = body && typeof body === "object" && "reason" in body && typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason || reason.length > 300) return NextResponse.json({ message: "再開理由を1～300文字で入力してください。" }, { status: 400 });
    const session = await prisma.$transaction(async tx => {
      const before = await tx.stocktakeSession.findUnique({ where: { id } });
      if (!before) throw new Error("REOPEN_NOT_FOUND");
      if (!canReopenStocktake(before.status)) throw new Error("REOPEN_INVALID_STATUS");
      const previousRecords = before.status === "COMPLETED" ? await tx.stocktakeRecord.findMany({ where: { sessionId: id }, select: { inventoryInstanceId: true, countedQuantity: true, memo: true, updatedAt: true } }) : [];
      const changed = await tx.stocktakeSession.updateMany({ where: { id, status: before.status, updatedAt: before.updatedAt }, data: { status: "IN_PROGRESS", pausedAt: null, ...(before.status === "COMPLETED" && !before.completedAt ? { completedAt: new Date() } : {}) } });
      if (changed.count !== 1) throw new Error("REOPEN_CHANGED");
      await tx.stocktakePresence.create({data:{sessionId:id,deviceId:"starting-"+randomUUID(),userId:auth.user!.id,expiresAt:new Date(Date.now()+120000)}});
      await tx.adminActionLog.create({ data: { adminUserId: auth.user!.id, action: "STOCKTAKE_REOPEN", route: `/stocktake/${id}`, detail: { sessionId: id, title: before.title, reason, previousStatus: before.status, newStatus: "IN_PROGRESS", recordsPreserved: true, operatorUserId: before.operatorUserId, previousCompletedAt: before.completedAt?.toISOString() ?? null, previousRecords: JSON.parse(JSON.stringify(previousRecords)) } } });
      return { id, title: before.title, status: "IN_PROGRESS" };
    });
    return NextResponse.json({ success: true, message: "入力済みの数量を残して棚卸を再開しました。", session });
  } catch (error) {
    const code = error instanceof Error ? error.message : "REOPEN_FAILED";
    const messages: Record<string, string> = {
      REOPEN_NOT_FOUND: "棚卸が見つかりません。",
      REOPEN_INVALID_STATUS: "確認待ち・完了の棚卸を再開できます。最新の状態を確認してください。",
      REOPEN_CHANGED: "別の端末で棚卸の状態が変更されました。画面を更新して確認してください。",
    };
    const conflict = code === "REOPEN_CHANGED" || code === "REOPEN_INVALID_STATUS" || (error && typeof error === "object" && "code" in error && error.code === "P2034");
    return NextResponse.json({ code, message: messages[code] ?? (conflict ? messages.REOPEN_CHANGED : "再開できませんでした。時間をおいて再試行してください。") }, { status: code === "REOPEN_NOT_FOUND" ? 404 : conflict ? 409 : error instanceof SyntaxError ? 400 : 500 });
  }
}
