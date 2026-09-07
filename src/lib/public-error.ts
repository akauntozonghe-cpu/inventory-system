/** Internal exceptions stay in server logs; the UI receives a stable explanation. */
export function publicErrorMessage(_error: unknown, fallback: string) { return fallback; }
