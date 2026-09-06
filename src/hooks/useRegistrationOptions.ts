"use client";
import { fetchFresh } from "@/lib/fetch-fresh";
import { useCallback, useEffect, useState } from "react";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { DEFAULT_UNITS } from "@/lib/unit";
type Options = { storageLocationOptions: {id: string; name: string}[]; majorCategories: string[]; minorCategories: string[]; minorCategoryOptions: { name: string; parentName: string }[]; units: string[] };
export function useRegistrationOptions(active = true) {
  const [options, setOptions] = useState<Options>({ storageLocationOptions: [], majorCategories: [], minorCategories: [], minorCategoryOptions: [], units: DEFAULT_UNITS });
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    if (!active) return;
    const response = await fetchFresh("/api/stocktake/options");
    if (!response.ok) throw new Error("選択肢を取得できませんでした。");
    const data = await response.json();
    setReady(true);
    setOptions({ storageLocationOptions: data.storageLocationOptions ?? [], majorCategories: data.majorCategories ?? [], minorCategories: data.minorCategories ?? [], minorCategoryOptions: data.minorCategoryOptions ?? [], units: data.units ?? DEFAULT_UNITS });
  }, [active]);
  const failed = useLiveRefresh(refresh);
  useEffect(() => { void refresh().catch(() => {}); }, [refresh]);
  return { ...options, ready, failed, minorsFor: (major: string) => options.minorCategoryOptions.filter((entry) => entry.parentName === major).map((entry) => entry.name) };
}
