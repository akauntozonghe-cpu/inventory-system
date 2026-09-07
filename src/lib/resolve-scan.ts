import { fetchFresh } from "./fetch-fresh";
import { parseScan, type ScanPayload } from "./scan-payload";
export async function resolveScan(raw: string): Promise<ScanPayload> {
  const scanned = parseScan(raw);
  if (scanned.type === "INVALID") throw new Error("このQRは商品・大分類・保管場所のラベルではありません。正しいラベルを読み取ってください。");
  if (scanned.type === "CLASSIFICATION" && scanned.code) {
    const response = await fetchFresh(`/api/classifications/resolve?labelCode=${encodeURIComponent(scanned.code)}`);
    const body = await response.json().catch(() => null);
    if (!response.ok || typeof body?.classification?.name !== "string") throw new Error("大分類ラベルを確認できませんでした。通信と分類管理の登録内容を確認してください。");
    return { ...scanned, name: body.classification.name };
  }
  if (scanned.type === "LOCATION") {
    const response = await fetchFresh("/api/storage-locations");
    const body: unknown = await response.json().catch(() => null);
    const row = response.ok && Array.isArray(body) ? body.find((entry: { id?: string; name?: string }) => scanned.id ? entry.id === scanned.id : entry.name === scanned.name) : undefined;
    if (!row || typeof row.id !== "string" || typeof row.name !== "string") throw new Error("保管場所ラベルを確認できませんでした。通信と保管場所の登録内容を確認してください。");
    return { type: "LOCATION", id: row.id, name: row.name };
  }
  return scanned;
}
