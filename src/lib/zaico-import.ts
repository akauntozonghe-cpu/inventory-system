import { unitValidationMessage } from "./unit";

export type ZaicoRow = { name: string; janCode: string; quantity: string; unit: string; storageLocation: string; majorCategory: string; manufacturer?: string; minorCategory?: string; managementCode?: string; managementGroupCode?: string; lotNo?: string; expirationDate?: string; photoRefs?: string[] };
export type ImportCandidate = { id: string; name: string; janCode: string | null; isArchived: boolean; managementCode?: string | null };
export type ImportDecision = { status: "CREATE" | "LINK" | "PENDING"; reason: string; itemId?: string; candidates: ImportCandidate[] };
export const MAX_ZAICO_ROWS = 1000;

const string = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).normalize("NFKC").trim() : "";
export function normalizeZaicoRow(value: unknown): ZaicoRow {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const extra: Partial<ZaicoRow> = {};
  for (const key of ["manufacturer", "minorCategory", "managementCode", "managementGroupCode", "lotNo", "expirationDate"] as const) if (string(row[key])) extra[key] = string(row[key]);
  if(Array.isArray(row.photoRefs)){const refs=[...new Set(row.photoRefs.filter((value):value is string=>typeof value==="string").map(value=>value.trim()).filter(Boolean))];if(refs.length)extra.photoRefs=refs;}
  return { name: string(row.name), janCode: string(row.janCode), quantity: string(row.quantity), unit: string(row.unit) || "個", storageLocation: string(row.storageLocation), majorCategory: string(row.majorCategory), ...extra };
}

// Barcode cells must be read as strings. Never reconstruct rounded scientific notation.
export function mapZaicoRows(rows: Record<string, unknown>[]): ZaicoRow[] {
  return rows.map(row => {
    const pick = (...names: string[]) => names.map(name => row[name]).find(value => string(value) !== "") ?? "";
    return normalizeZaicoRow({ photoRefs:["写真","画像","写真ファイル名","画像ファイル名","写真URL","画像URL",...Array.from({length:5},(_,i)=>"写真"+(i+1))].flatMap(key=>String(row[key]??"").split(/[\n;]/)).map(value=>value.trim()).filter(Boolean), name: pick("商品名", "品名", "物品名"), janCode: pick("JAN", "JANコード", "QRコード・バーコードの値"), quantity: pick("数量", "個数"), unit: pick("単位", "個数単位"), storageLocation: pick("保管場所"), majorCategory: pick("大分類", "カテゴリ"), minorCategory: pick("小分類"), manufacturer: pick("メーカー", "会社名"), managementCode: pick("管理コード"), managementGroupCode: pick("管理区分"), lotNo: pick("ロット", "Lot.No・製造番号"), expirationDate: pick("期限", "賞味期限", "消費期限") });
  });
}

export function validJan(value: string) {
  if (!/^(?:\d{8}|\d{13})$/.test(value)) return false;
  const digits = value.slice(0, -1).split("").reverse();
  const sum = digits.reduce((n, digit, index) => n + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === Number(value.at(-1));
}

export function importDate(value: string) {
  const match = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number), date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function rowProblem(row: ZaicoRow) {
  if ((row.photoRefs?.length??0)>5 || row.photoRefs?.some(ref=>ref.length>2000)) return "写真は5枚まで、写真の参照先は2000文字以内にしてください。";
  if (!row.name || row.name.length > 200) return "商品名は1〜200文字で入力してください。";
  if (!/^\d+$/.test(row.quantity) || !Number.isSafeInteger(Number(row.quantity)) || Number(row.quantity) > 2147483647) return "数量は0〜2147483647の整数で入力してください。";
  if (row.storageLocation.length > 100 || row.majorCategory.length > 100 || row.janCode.length > 100) return "保管場所・カテゴリ・バーコードは100文字以内で入力してください。";
  if (row.expirationDate && !importDate(row.expirationDate)) return "期限は年/月/日で入力してください。";
  if (row.minorCategory && !row.majorCategory) return "小分類には大分類も指定してください。";
  if ([row.manufacturer, row.minorCategory, row.managementCode, row.managementGroupCode, row.lotNo].some(value => value && value.length > 100)) return "追加項目は100文字以内で入力してください。";
  return unitValidationMessage(row.unit);
}

export function decideZaicoRow(row: ZaicoRow, items: ImportCandidate[], _allowNoJan = false): ImportDecision {
  void _allowNoJan; // Kept for pending reviews saved by older clients.
  const candidates = row.janCode ? items.filter(item => string(item.janCode) === row.janCode) : [];
  const problem = rowProblem(row);
  if (problem) return { status: "PENDING", reason: problem, candidates };
  if (row.managementCode && items.some(item => item.managementCode === row.managementCode && !candidates.some(candidate => candidate.id === item.id))) return {status:"PENDING",reason:"管理コードが別の商品で使われています。重複を確認してください。",candidates};
  if (!validJan(row.janCode)) return candidates.length ? { status: "PENDING", reason: "同じ不正なコードを持つ商品があります。重複を確認してください。", candidates } : { status: "CREATE", reason: "システムJANを付けて登録します。商品のJANは棚卸時に編集できます。", candidates };
  if (candidates.length > 1) return { status: "PENDING", reason: "同じJANの商品が複数あります。紐付け先を選んでください。", candidates };
  if (candidates[0]?.isArchived) return { status: "PENDING", reason: "同じJANの商品が廃止されています。商品情報を確認してください。", candidates };
  if (candidates.length === 1) return { status: "LINK", reason: "既存商品に紐付けます。在庫数量は変更しません。", itemId: candidates[0].id, candidates };
  return { status: "CREATE", reason: "新しい商品と在庫を登録します。", candidates };
}
