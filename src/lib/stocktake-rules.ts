export type StocktakeWorkflowStatus =
  | "IN_PROGRESS"
  | "PAUSED"
  | "REVIEW"
  | "CONFLICT"
  | "COMPLETED"
  | "CANCELLED";

export function getStocktakeStatusLabel(
  status: StocktakeWorkflowStatus
) {
  const labels: Record<StocktakeWorkflowStatus, string> = {
    IN_PROGRESS: "作業中",
    PAUSED: "中断中",
    REVIEW: "確認待ち",
    CONFLICT: "競合中",
    COMPLETED: "正式確定済み",
    CANCELLED: "取消済み",
  };

  return labels[status];
}

export function canRecordStocktake(status: StocktakeWorkflowStatus) {
  return status === "IN_PROGRESS";
}

export function canPauseStocktake(status: StocktakeWorkflowStatus) {
  return status === "IN_PROGRESS";
}

export function canResumeStocktake(status: StocktakeWorkflowStatus) {
  return status === "PAUSED";
}

export function canSubmitStocktakeForReview(
  status: StocktakeWorkflowStatus
) {
  return status === "IN_PROGRESS";
}

export function canApplyStocktake(status: StocktakeWorkflowStatus) {
  return status === "REVIEW";
}

export function canCancelStocktake(status: StocktakeWorkflowStatus) {
  return (
    status === "IN_PROGRESS" ||
    status === "PAUSED" ||
    status === "REVIEW" ||
    status === "CONFLICT"
  );
}

export function normalizeBarcode(value: string) {
  return value
    .replace(/[０-９]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0xfee0)
    )
    .replace(/[^\d]/g, "");
}

export function calculateEan13CheckDigit(base12: string) {
  const normalized = normalizeBarcode(base12);

  if (!/^\d{12}$/.test(normalized)) {
    throw new Error("EAN-13の先頭12桁を指定してください。");
  }

  const total = normalized
    .split("")
    .reverse()
    .reduce((sum, digit, index) => {
      const number = Number(digit);

      return sum + number * (index % 2 === 0 ? 3 : 1);
    }, 0);

  return String((10 - (total % 10)) % 10);
}

export function isValidEan13(value: string) {
  const barcode = normalizeBarcode(value);

  if (!/^\d{13}$/.test(barcode)) {
    return false;
  }

  const expectedCheckDigit = calculateEan13CheckDigit(barcode.slice(0, 12));

  return barcode.at(-1) === expectedCheckDigit;
}