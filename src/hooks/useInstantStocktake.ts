"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getInstantStocktakeRecords,
  saveInstantStocktakeRecord,
} from "@/lib/instant-stocktake-queue";
import { syncInstantStocktakeRecords } from "@/lib/sync-instant-stocktake";

type SaveInput = {
  inventoryInstanceId: string;
  countedQuantity: number;
  memo?: string;
  errorCode?: string;
  errorReportId?: string;
};

export function useInstantStocktake(sessionId: string) {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPendingCount = useCallback(async () => {
    const records = await getInstantStocktakeRecords(sessionId);
    setPendingCount(records.length);

    return records.length;
  }, [sessionId]);

  const sync = useCallback(async () => {
    setSyncing(true);

    try {
      const result = await syncInstantStocktakeRecords(sessionId);
      await refreshPendingCount();

      return result;
    } finally {
      setSyncing(false);
    }
  }, [refreshPendingCount, sessionId]);

  const saveInstant = useCallback(
    async (input: SaveInput) => {
      const record = await saveInstantStocktakeRecord({
        sessionId,
        inventoryInstanceId: input.inventoryInstanceId,
        countedQuantity: input.countedQuantity,
        memo: input.memo,
        lastErrorCode: input.errorCode,
        errorReportId: input.errorReportId,
      });

      await refreshPendingCount();

      return record;
    },
    [refreshPendingCount, sessionId]
  );

  useEffect(() => {
    void refreshPendingCount();

    if (navigator.onLine) {
      void sync();
    }

    const handleOnline = () => {
      void sync();
    };

    window.addEventListener("online", handleOnline);
    const timer = window.setInterval(() => {
      if (navigator.onLine) void sync();
    }, 15000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.clearInterval(timer);
    };
  }, [refreshPendingCount, sync]);

  return {
    pendingCount,
    syncing,
    refreshPendingCount,
    sync,
    saveInstant,
  };
}
