"use client";
import { useEffect, useRef, useState } from "react";
import { subscribeLiveRefresh } from "@/lib/shared-live-refresh";

export function useLiveRefresh(refresh: () => Promise<unknown>, enabled = true) {
  const callback = useRef(refresh);
  const [failed, setFailed] = useState(false);
  useEffect(() => { callback.current = refresh; }, [refresh]);
  useEffect(() => enabled ? subscribeLiveRefresh(async () => {
    await callback.current();
    setFailed(false);
  }, () => setFailed(true)) : undefined, [enabled]);
  return failed;
}
