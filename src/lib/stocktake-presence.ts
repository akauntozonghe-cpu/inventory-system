import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

export const PRESENCE_TTL_MS = 120_000;
type Tx = Prisma.TransactionClient;

// Lock the parent before changing any lease. A leaving device cannot pause a
// session while another device is concurrently joining it.
async function lockSession(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "StocktakeSession" WHERE id = ${id} FOR UPDATE`;
}
async function pauseIfEmpty(tx: Tx, sessionId: string, now: Date) {
  const active = await tx.stocktakePresence.count({ where: { sessionId, closed: false, expiresAt: { gt: now } } });
  if (active) return false;
  const changed = await tx.stocktakeSession.updateMany({ where: { id: sessionId, status: "IN_PROGRESS" }, data: { status: "PAUSED", pausedAt: now } });
  return changed.count > 0;
}

export async function updatePresence(sessionId: string, deviceId: string, userId: string, admin: boolean, leave = false) {
  return prisma.$transaction(async tx => {
    await lockSession(tx, sessionId);
    const session = await tx.stocktakeSession.findUnique({ where: { id: sessionId } });
    if (!session) return { status: 404, code: "STOCKTAKE_NOT_FOUND", message: "棚卸が見つかりません。" };
    if (!admin && session.operatorUserId !== null && session.operatorUserId !== userId) return { status: 403, code: "STOCKTAKE_FORBIDDEN", message: "この棚卸を操作できません。" };
    if (leave) {
      const existing = await tx.stocktakePresence.findUnique({ where: { sessionId_deviceId: { sessionId, deviceId } } });
      if (existing && existing.userId !== userId) return { status: 403, code: "PRESENCE_FORBIDDEN", message: "別の作業者の端末は終了できません。" };
      await tx.stocktakePresence.upsert({ where: { sessionId_deviceId: { sessionId, deviceId } }, create: { sessionId, deviceId, userId, closed: true, expiresAt: new Date(Date.now() + PRESENCE_TTL_MS) }, update: { closed: true } });
      const paused = await pauseIfEmpty(tx, sessionId, new Date());
      return { status: 200, paused };
    }
    if (session.status !== "IN_PROGRESS") return { status: 409, code: "STOCKTAKE_NOT_ACTIVE", message: "中断・終了した棚卸です。最新の状態を確認して再開してください。" };
    const now = new Date();
    const existing = await tx.stocktakePresence.findUnique({ where: { sessionId_deviceId: { sessionId, deviceId } } });
    if (existing?.closed || (existing && existing.userId !== userId)) return { status: 409, code: "PRESENCE_CLOSED", message: "この端末の作業は中断しました。棚卸を開き直してください。" };
    await tx.stocktakePresence.deleteMany({where:{sessionId,deviceId:{startsWith:"starting-"}}});
    await tx.stocktakePresence.upsert({ where: { sessionId_deviceId: { sessionId, deviceId } }, create: { sessionId, deviceId, userId, expiresAt: new Date(now.getTime() + PRESENCE_TTL_MS) }, update: { userId, expiresAt: new Date(now.getTime() + PRESENCE_TTL_MS) } });
    return { status: 200, paused: false };
  });
}

export async function expireStocktakePresence(sessionId?: string) {
  const now = new Date();
  const stale = await prisma.stocktakePresence.findMany({ where: { ...(sessionId ? { sessionId } : {}), expiresAt: { lte: now } }, distinct: ["sessionId"], select: { sessionId: true }, take: 100 });
  for (const entry of stale) await prisma.$transaction(async tx => {
    await lockSession(tx, entry.sessionId);
    // Re-evaluate after locking; the heartbeat may have renewed this lease.
    const deleted = await tx.stocktakePresence.deleteMany({ where: { sessionId: entry.sessionId, expiresAt: { lte: now } } });
    if (deleted.count) await pauseIfEmpty(tx, entry.sessionId, now);
  });
}
