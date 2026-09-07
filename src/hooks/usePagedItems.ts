"use client";
import { useState } from "react";
import { pageWindow } from "@/lib/pagination";

/** Keep the current page during live refresh; a changed search starts at page 1. */
export function usePagedItems<T>(items: T[], filterKey: string, size = 30) {
  const [selection, setSelection] = useState({ key: filterKey, page: 1 });
  const window = pageWindow(items.length, selection.key === filterKey ? selection.page : 1, size);
  return {
    ...window,
    visible: items.slice(window.start, window.end),
    onPageChange: (page: number) => setSelection({ key: filterKey, page }),
  };
}
