"use client";
import { useEffect, useRef, useState } from "react";
import { startLiveRefresh } from "@/lib/live-refresh";

export function useLiveRefresh(refresh: () => Promise<unknown>) {
  const callback = useRef(refresh);
  const [failed, setFailed] = useState(false);
  useEffect(() => { callback.current = refresh; }, [refresh]);
  useEffect(() => startLiveRefresh(async () => {
    await callback.current();
    setFailed(false);
  }, () => setFailed(true)), []);
  return failed;
}
