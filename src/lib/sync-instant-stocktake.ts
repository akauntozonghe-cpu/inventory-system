"use client";

import {
  getInstantStocktakeRecords,
  markInstantStocktakeRetry,
  removeInstantStocktakeRecord,
} from "@/lib/instant-stocktake-queue";

type SyncResult = {
  total: number;
  synced: number;
  failed: number;
};

let syncing = false;

/**
 * この端末に残っている一時保存データを、順番にサーバーへ送信する。
 * 二重起動は防止する。
 */
export async function syncInstantStocktakeRecords(
  sessionId?: string
): Promise<SyncResult> {
  if (syncing) {
    return {
      total: 0,
      synced: 0,
      failed: 0,
    };
  }

  syncing = true;

  try {
    const records = await getInstantStocktakeRecords(sessionId);

    let synced = 0;
    let failed = 0;

    for (const record of records) {
      try {
        if (record.errorReportId) {
          const approvalResponse = await fetch(
            `/api/error-reports/${encodeURIComponent(record.errorReportId)}`,
            { cache: "no-store" }
          );
          const approval: unknown = await approvalResponse
            .json()
            .catch(() => null);

          if (
            !approvalResponse.ok ||
            !approval ||
            typeof approval !== "object" ||
            !("approved" in approval) ||
            approval.approved !== true
          ) {
            continue;
          }
        }

        const response = await fetch("/api/stocktake/record", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: record.sessionId,
            inventoryInstanceId: record.inventoryInstanceId,
            countedQuantity: record.countedQuantity,
            memo: record.memo,
          }),
        });

        if (!response.ok) {
          throw new Error("棚卸データを送信できませんでした。");
        }

        await removeInstantStocktakeRecord(record.id);
        synced += 1;
      } catch {
        await markInstantStocktakeRetry(
          record,
          "INSTANT_SYNC_FAILED"
        );

        failed += 1;
      }
    }

    return {
      total: records.length,
      synced,
      failed,
    };
  } finally {
    syncing = false;
  }
}

/**
 * 端末がオンラインへ戻った時だけ、一時保存の送信を試す。
 */
export function startInstantStocktakeAutoSync(
  sessionId?: string
) {
  const handleOnline = () => {
    void syncInstantStocktakeRecords(sessionId);
  };

  window.addEventListener("online", handleOnline);

  if (navigator.onLine) {
    void syncInstantStocktakeRecords(sessionId);
  }

  return () => {
    window.removeEventListener("online", handleOnline);
  };
}
