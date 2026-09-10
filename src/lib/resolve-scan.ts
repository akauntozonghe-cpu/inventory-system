import { fetchFresh } from "./fetch-fresh";
import { parseScan, type ScanPayload } from "./scan-payload";
export async function resolveScan(raw: string): Promise<ScanPayload> {
  const scanned = parseScan(raw);
  if (scanned.type === "INVALID") throw new Error("SCAN_QR_UNSUPPORTED：このQRには対応していません。システムの商品・分類・保管場所のラベルを読み取ってください。");
  if (scanned.type === "CLASSIFICATION" && scanned.code) {
    const response = await fetchFresh(`/api/classifications/resolve?labelCode=${encodeURIComponent(scanned.code)}&allowMinor=true`);
    const body = await response.json().catch(() => null);
    if (!response.ok || typeof body?.classification?.name !== "string") throw new Error("SCAN_QR_NOT_FOUND：このQRの分類を確認できません。登録済みのラベルか、通信状態を確認してください。");
    return { ...scanned, name: body.classification.name, ...(body.classification.kind==="MINOR"?{kind:"MINOR" as const,parentName:body.classification.parentName}: {}) };
  }
  if(scanned.type==="CLASSIFICATION"&&!scanned.code){const response=await fetchFresh("/api/stocktake/options");if(!response.ok)throw new Error("SCAN_LOOKUP_FAILED：分類を確認できません。通信を確認して再度読み取ってください。");const data=await response.json();const exists=scanned.kind==="MINOR"?data.minorCategoryOptions?.some((row:{name:string;parentName:string})=>row.name===scanned.name&&row.parentName===scanned.parentName):data.majorCategories?.includes(scanned.name);if(!exists)throw new Error("SCAN_QR_NOT_MANAGED：このQRの分類は管理対象に登録されていません。登録済みのQRを使用してください。");}
  if (scanned.type === "LOCATION") {
    const response = await fetchFresh("/api/storage-locations");
    const body: unknown = await response.json().catch(() => null);
    const row = response.ok && Array.isArray(body) ? body.find((entry: { id?: string; name?: string }) => scanned.id ? entry.id === scanned.id : entry.name === scanned.name) : undefined;
    if (!row || typeof row.id !== "string" || typeof row.name !== "string") throw new Error("SCAN_QR_NOT_FOUND：このQRの保管場所を確認できません。登録済みのラベルか、通信状態を確認してください。");
    return { type: "LOCATION", id: row.id, name: row.name };
  }
  return scanned;
}
