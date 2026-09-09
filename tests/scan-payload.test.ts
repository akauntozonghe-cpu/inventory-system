import { describe, expect, it, vi } from "vitest";
import { parseScan, scanDisplayText } from "../src/lib/scan-payload";
const fetcher = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/fetch-fresh", () => ({ fetchFresh: fetcher }));
import { resolveScan } from "../src/lib/resolve-scan";
describe("QR payload routing", () => {
  it("routes printed classification and location JSON without treating it as a product", () => {
    const category = JSON.stringify({ type: "INVENTORY_CLASSIFICATION_LABEL", classificationLabelCode: "label", majorCategory: "食品" });
    expect(parseScan(category)).toEqual({ type: "CLASSIFICATION", code: "label", name: "食品" });
    expect(scanDisplayText(category)).toBe("大分類QRを読み取りました");
    const location = JSON.stringify({ type: "INVENTORY_LOCATION_LABEL", storageLocationId: "shelf", storageLocationName: "棚A" });
    expect(parseScan(location)).toEqual({ type: "LOCATION", id: "shelf", name: "棚A" });
    expect(scanDisplayText(location)).not.toContain("storageLocationId");
  });
  it.each(["CATEGORY:%E9%A3%9F%E5%93%81", "INVENTORY_OS:CATEGORY:MAJOR:食品", "大分類:食品", '{"category":"食品"}'])("accepts legacy classification QR %s", raw => {
    expect(parseScan(raw)).toMatchObject({ type: "CLASSIFICATION", name: "食品" });
  });
  it.each(["4901234567894", "lot-a"])("keeps product identifiers intact: %s", code => {
    expect(parseScan(code)).toEqual({ type: "ITEM", code });
  });
  it.each(['{"unknown":"SELECT * FROM Item"}', '{broken', 'SELECT * FROM Item', 'https://example.com'])('does not expose unsupported content %s', raw => {
    expect(parseScan(raw).type).toBe("INVALID");
    expect(scanDisplayText(raw)).toBe("対応していないQRです");
  });
  it("resolves renamed classification by label ID and hides raw server errors", async () => {
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ classification: { name: "新分類" } })));
    const raw = '{"classificationLabelCode":"label","majorCategory":"旧分類"}';
    expect(await resolveScan(raw)).toMatchObject({ type: "CLASSIFICATION", name: "新分類" });
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ message: "SELECT secret FROM Item" }), { status: 500 }));
    await expect(resolveScan(raw)).rejects.toThrow("大分類ラベルを確認できませんでした");
  });
  it("resolves renamed locations by ID rather than stale label names", async () => {
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify([{ id: "shelf", name: "新しい棚" }])));
    expect(await resolveScan('{"type":"INVENTORY_LOCATION_LABEL","storageLocationId":"shelf","storageLocationName":"古い棚"}')).toEqual({ type: "LOCATION", id: "shelf", name: "新しい棚" });
  });
});

it("prioritizes product identity over category metadata in a product QR",()=>{expect(parseScan(JSON.stringify({inventoryInstanceId:"lot-1",majorCategory:"食品",janCode:"4901234567894"}))).toEqual({type:"ITEM",code:"lot-1"});});
it("keeps a minor category tied to its major category",()=>{expect(parseScan(JSON.stringify({type:"INVENTORY_CLASSIFICATION_LABEL",kind:"MINOR",classificationLabelCode:"minor-label",minorCategory:"飲料",parentName:"食品"}))).toMatchObject({type:"CLASSIFICATION",kind:"MINOR",name:"飲料",parentName:"食品",code:"minor-label"});});
