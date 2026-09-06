"use client";
import { useEffect, useRef, useState } from "react";
import { subscribeLiveRefresh } from "@/lib/shared-live-refresh";

export function useLiveRefresh(refresh: () => Promise<unknown>) {
  const callback = useRef(refresh);
  const [failed, setFailed] = useState(false);
  useEffect(() => { callback.current = refresh; }, [refresh]);
  useEffect(() => subscribeLiveRefresh(async () => {
    await callback.current();
    setFailed(false);
  }, () => setFailed(true)), []);
  return failed;
}
