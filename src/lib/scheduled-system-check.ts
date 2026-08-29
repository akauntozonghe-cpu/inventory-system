import { prisma } from "@/lib/prisma";

export async function maybeRunScheduledSystemCheck(intervalMinutes: number) {
  const lastRun = await prisma.systemCheckRun.findFirst({ where: { mode: "AUTO" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (lastRun && Date.now() - lastRun.createdAt.getTime() < intervalMinutes * 60_000) return;

  const admin = await prisma.appUser.findFirst({ where: { role: "ADMIN", isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!admin) return;

  const [itemCount, inventoryCount, activeAdmins, unresolvedRecovery, records, targets] = await Promise.all([
    prisma.item.count(),
    prisma.inventoryInstance.count(),
    prisma.appUser.count({ where: { role: "ADMIN", isActive: true } }),
    prisma.errorReport.count({ where: { recoveryStatus: "ADMIN_REQUIRED", status: { in: ["OPEN", "INVESTIGATING"] } } }),
    prisma.stocktakeRecord.findMany({ select: { sessionId: true, inventoryInstanceId: true } }),
    prisma.stocktakeTarget.findMany({ select: { sessionId: true, inventoryInstanceId: true } }),
  ]);
  const targetKeys = new Set(targets.map((entry) => `${entry.sessionId}:${entry.inventoryInstanceId}`));
  const orphanRecords = records.filter((entry) => !targetKeys.has(`${entry.sessionId}:${entry.inventoryInstanceId}`)).length;
  const checks = [
    { code: "SCHEDULED_DB", title: "データベース接続", status: "PASS" as const, detail: `商品${itemCount}件・在庫${inventoryCount}件を取得` },
    { code: "SCHEDULED_ADMIN", title: "復旧担当者", status: activeAdmins > 0 ? "PASS" as const : "FAIL" as const, detail: `有効な管理者${activeAdmins}名` },
    { code: "SCHEDULED_STOCKTAKE_LINK", title: "棚卸データ整合性", status: orphanRecords === 0 ? "PASS" as const : "FAIL" as const, detail: `対象のない棚卸記録${orphanRecords}件` },
    { code: "SCHEDULED_RECOVERY_QUEUE", title: "管理者復旧待ち", status: unresolvedRecovery === 0 ? "PASS" as const : "WARNING" as const, detail: `管理者復旧待ち${unresolvedRecovery}件` },
  ];
  const failed = checks.some((check) => check.status === "FAIL");
  const warning = checks.some((check) => check.status === "WARNING");
  const status = failed ? "FAILED" : warning ? "WARNING" : "PASSED";
  const summary = `正常 ${checks.filter((c) => c.status === "PASS").length}件 / 注意 ${checks.filter((c) => c.status === "WARNING").length}件 / 異常 ${checks.filter((c) => c.status === "FAIL").length}件`;
  const run = await prisma.systemCheckRun.create({ data: { mode: "AUTO", status, summary, executedByUserId: admin.id, completedAt: new Date(), items: { create: checks.map((check) => ({ ...check, type: "AUTO" })) } } });
  if (failed) {
    const report = await prisma.errorReport.create({ data: { code: "SCHEDULED_SYSTEM_CHECK_FAILED", title: "定期自動点検で異常を検出しました", message: summary, severity: "ERROR", status: "INVESTIGATING", recoveryStatus: "ADMIN_REQUIRED", recoveryNote: "自動修復で安全性を保証できない項目です。管理画面の復旧手順に従ってください。", route: "/admin/system-check", reporterUserId: admin.id, detail: { systemCheckRunId: run.id, recoveryRoute: "/admin/system-check", steps: ["システム点検を開く", "異常項目の『対応する』を実行", "再点検が正常になったことを確認", "エラーレポートを解決済みにする"] } } });
    await prisma.notification.create({ data: { type: "SYSTEM_ERROR", audience: "ADMIN", title: "定期点検で管理者復旧が必要です", message: summary, detail: { errorReportId: report.id, systemCheckRunId: run.id } } });
  }
}
