import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getAdminElevation } from "@/lib/auth";
import { inspectionTargets } from "@/lib/inspection-targets";
import { targetChecks } from "@/lib/inspection-target-types";
import { recoverySessionId } from "@/lib/recovery-context";
import { isInspectionTarget } from "@/lib/product-scope";
import { unitValidationMessage } from "@/lib/unit";
async function scope(runId: string, code: string) {
    const run = await prisma.systemCheckRun.findUnique({ where: { id: runId }, include: { items: true } });
    if (!run || !targetChecks.includes(code as typeof targetChecks[number]) || !run.items.some(i => i.code === code && i.status !== "PASS"))
        throw new Error("TARGET_RUN_MISMATCH");
    const report = run.errorReportId ? await prisma.errorReport.findUnique({ where: { id: run.errorReportId }, select: { sessionId: true } }) : null;
    return recoverySessionId(run.contextRoute ?? undefined, report?.sessionId);
}
const failure = (error: unknown) => { const code = error instanceof Error ? error.message : "TARGET_FAILED"; const messages: Record<string, string> = { TARGET_RUN_MISMATCH: "この点検項目を再点検して、最新の対象を表示してください。", TARGET_CHANGED: "表示後にこの対象が更新されました。変更は保存していません。「対象を再確認」で内容を読み直してください。", TARGET_INPUT_INVALID: "変更理由と、表示された対象・変更内容を確認してください。", TARGET_ALREADY_FIXED: "この記録はすでに対象へ登録されています。再点検してください。" }; return NextResponse.json({ code: Object.hasOwn(messages, code) ? code : "TARGET_FAILED", message: messages[code] ?? "対象を確認・保存できませんでした。通信回復後に対象を再確認してください。" }, { status: code === "TARGET_INPUT_INVALID" ? 400 : 409 }); };
export async function GET(request: NextRequest) {
    const auth = requireAdmin(request);
    if (auth.response)
        return auth.response;
    try {
        const code = request.nextUrl.searchParams.get("checkCode") ?? "";
        const sessionId = await scope(request.nextUrl.searchParams.get("runId") ?? "", code);
        return NextResponse.json(await inspectionTargets(code, sessionId, request.nextUrl.searchParams.get("cursor")), { headers: { "Cache-Control": "no-store" } });
    }
    catch (error) {
        return failure(error);
    }
}
export async function PATCH(request: NextRequest) {
    const auth = requireAdmin(request);
    if (auth.response || !auth.user)
        return auth.response;
    try {
        const body = await request.json();
        const reason = typeof body.reason === "string" ? body.reason.trim() : "";
        const expected = typeof body.expectedUpdatedAt === "string" ? new Date(body.expectedUpdatedAt) : null;
        if (reason.length < 2 || reason.length > 500 || !expected || !Number.isFinite(expected.getTime()) || typeof body.targetId !== "string")
            throw new Error("TARGET_INPUT_INVALID");
        const code = body.checkCode as string, action = body.action as string;
        const permitted: Record<string, string> = { SYNC_PRODUCT_METADATA: "CHECK_PRODUCT_LINKS", SET_UNIT: "CHECK_INVALID_UNITS", RESTORE_TARGET: "CHECK_STOCKTAKE_TARGET_LINK" };
        if (permitted[action] !== code)
            throw new Error("TARGET_INPUT_INVALID");
        const sessionId = await scope(body.runId, code);
        const actor = auth.user.role === "ADMIN" ? auth.user.id : getAdminElevation(request)?.adminUserId;
        if (!actor)
            throw new Error("TARGET_INPUT_INVALID");
        await prisma.$transaction(async (tx) => {
            if (action === "RESTORE_TARGET") {
                const row = await tx.stocktakeRecord.findUnique({ where: { id: body.targetId }, include: { session: true, inventoryInstance: { include: { item: true } } } });
                if (!row || row.updatedAt.getTime() !== expected.getTime() || row.session.updatedAt.toISOString() !== body.sessionUpdatedAt || (sessionId && row.sessionId !== sessionId) || !isInspectionTarget(row.inventoryInstance.item, row.inventoryInstance.status))
                    throw new Error("TARGET_CHANGED");
                if (!Number.isSafeInteger(body.expectedQuantity) || body.expectedQuantity < 0 || body.expectedQuantity > 2147483647)
                    throw new Error("TARGET_INPUT_INVALID");
                if (await tx.stocktakeTarget.findUnique({ where: { sessionId_inventoryInstanceId: { sessionId: row.sessionId, inventoryInstanceId: row.inventoryInstanceId } } }))
                    throw new Error("TARGET_ALREADY_FIXED");
                const claimed = await tx.stocktakeSession.updateMany({ where: { id: row.sessionId, updatedAt: row.session.updatedAt }, data: { updatedAt: new Date() } });
                if (claimed.count !== 1)
                    throw new Error("TARGET_CHANGED");
                await tx.stocktakeTarget.create({ data: { sessionId: row.sessionId, inventoryInstanceId: row.inventoryInstanceId, expectedQuantity: body.expectedQuantity } });
                await tx.adminActionLog.create({ data: { adminUserId: actor, action: "RESTORE_STOCKTAKE_TARGET", route: "/admin/system-check", detail: { reason, recordId: row.id, sessionId: row.sessionId, operatorUserId: row.session.operatorUserId, inventoryInstanceId: row.inventoryInstanceId, expectedQuantity: body.expectedQuantity, countedQuantity: row.countedQuantity, runId: body.runId } } });
                return;
            }
            const row = await tx.inventoryInstance.findUnique({ where: { id: body.targetId }, include: { item: true } });
            if (!row || !isInspectionTarget(row.item, row.status) || row.updatedAt.getTime() !== expected.getTime() || row.item.updatedAt.toISOString() !== body.itemUpdatedAt)
                throw new Error("TARGET_CHANGED");
            if (action === "SET_UNIT" && (typeof body.unit !== "string" || !body.unit.trim() || unitValidationMessage(body.unit)))
                throw new Error("TARGET_INPUT_INVALID");
            const after = action === "SET_UNIT" ? { unit: body.unit.normalize("NFKC").trim() } : { majorCategory: row.item.majorCategory, minorCategory: row.item.minorCategory, manufacturer: row.item.manufacturer };
            const updated = await tx.inventoryInstance.updateMany({ where: { id: row.id, updatedAt: expected }, data: after });
            if (updated.count !== 1)
                throw new Error("TARGET_CHANGED");
            await tx.adminActionLog.create({ data: { adminUserId: actor, action: "INSPECTION_" + action, route: "/admin/system-check", detail: { reason, inventoryInstanceId: row.id, itemId: row.itemId, before: { unit: row.unit, majorCategory: row.majorCategory, minorCategory: row.minorCategory, manufacturer: row.manufacturer }, after, runId: body.runId } } });
        }, { isolationLevel: "Serializable", timeout: 30000 });
        return NextResponse.json({ message: "表示した対象の変更を保存しました。在庫数量と他の棚卸の入力は変更していません。再点検で結果を確認してください。" });
    }
    catch (error) {
        return failure(error);
    }
}
