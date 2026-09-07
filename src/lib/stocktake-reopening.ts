export function canReopenStocktake(status: string) {
  return status === "REVIEW" || status === "COMPLETED";
}

/** CompletedAt retains the previous confirmation boundary while a session is reopened. */
export function recordsForConfirmation<T extends { updatedAt: Date }>(records: T[], previousCompletedAt: Date | null | undefined) {
  return previousCompletedAt ? records.filter(record => record.updatedAt > previousCompletedAt) : records;
}
