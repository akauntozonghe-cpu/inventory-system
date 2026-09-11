import { unitValidationMessage } from "./unit";

export type ZaicoRow = { name: string; janCode: string; quantity: string; unit: string; storageLocation: string; majorCategory: string };
export type ImportCandidate = { id: string; name: string; janCode: string | null; isArchived: boolean };
export type ImportDecision = { status: "CREATE" | "LINK" | "PENDING"; reason: string; itemId?: string; candidates: ImportCandidate[] };
export const MAX_ZAICO_ROWS = 1000;

const string = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).normalize("NFKC").trim() : "";
export function normalizeZaicoRow(value: unknown): ZaicoRow {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { name: string(row.name), janCode: string(row.janCode), quantity: string(row.quantity), unit: string(row.unit) || "個", storageLocation: string(row.storageLocation), majorCategory: string(row.majorCategory) };
}

// Barcode cells must be read as strings. Never reconstruct rounded scientific notation.
export function mapZaicoRows(rows: Record<string, unknown>[]): ZaicoRow[] {
  return rows.map(row => normalizeZaicoRow({ name: row["物品名"], janCode: row["QRコード・バーコードの値"], quantity: row["数量"], unit: row["単位"], storageLocation: row["保管場所"], majorCategory: row["カテゴリ"] }));
}

export function validJan(value: string) {
  if (!/^(?:\d{8}|\d{13})$/.test(value)) return false;
  const digits = value.slice(0, -1).split("").reverse();
  const sum = digits.reduce((n, digit, index) => n + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === Number(value.at(-1));
}

export function rowProblem(row: ZaicoRow) {
  if (!row.name || row.name.length > 200) return "商品名は1〜200文字で入力してください。";
  if (!/^\d+$/.test(row.quantity) || !Number.isSafeInteger(Number(row.quantity)) || Number(row.quantity) > 2147483647) return "数量は0〜2147483647の整数で入力してください。";
  if (row.storageLocation.length > 100 || row.majorCategory.length > 100 || row.janCode.length > 100) return "保管場所・カテゴリ・バーコードは100文字以内で入力してください。";
  return unitValidationMessage(row.unit);
}

export function decideZaicoRow(row: ZaicoRow, items: ImportCandidate[], allowNoJan = false): ImportDecision {
  const candidates = row.janCode ? items.filter(item => string(item.janCode) === row.janCode) : [];
  const problem = rowProblem(row);
  if (problem) return { status: "PENDING", reason: problem, candidates };
  if (!validJan(row.janCode) && !(allowNoJan && !row.janCode)) return { status: "PENDING", reason: row.janCode ? "JANの桁数・チェック桁を確認してください。" : "JANがありません。修正するか、JANなしの新規登録を選んでください。", candidates };
  if (candidates.length > 1) return { status: "PENDING", reason: "同じJANの商品が複数あります。紐付け先を選んでください。", candidates };
  if (candidates[0]?.isArchived) return { status: "PENDING", reason: "同じJANの商品が廃止されています。商品情報を確認してください。", candidates };
  if (candidates.length === 1) return { status: "LINK", reason: "既存商品に紐付けます。在庫数量は変更しません。", itemId: candidates[0].id, candidates };
  return { status: "CREATE", reason: "新しい商品と在庫を登録します。", candidates };
}
