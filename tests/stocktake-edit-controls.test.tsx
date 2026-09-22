import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/components/stocktake/StocktakePhoto", () => ({ default: () => null }));
import StocktakeInputPanel from "../src/components/stocktake/StocktakeInputPanel";

const selected = {
  id: "stock-B", expectedQuantity: 5, countedQuantity: null, lotNo: "LOT-B", expirationDate: null, unit: "個", storageLocation: { name: "棚B" },
  item: { id: "shared-item", name: "商品", janCode: "4901234567894", systemBarcode: null, managementCode: null, manufacturer: null, majorCategory: "備品", minorCategory: "店舗用", defaultUnit: "個" },
};
const render = (edits: { onEditProduct?: () => void; onEditInventory?: () => void }, continuous = false) => renderToStaticMarkup(
  <StocktakeInputPanel selected={selected} quantity="7" memo="入力途中" onMemoChange={() => {}} saving={false} disabled={false} inputRef={{ current: null }} onQuantityChange={() => {}} onSave={() => {}} onCancel={() => {}} continuous={continuous} {...edits}/>
);

it.each([false, true])("shows the two independently assigned editing controls in continuous=%s", continuous => {
  const inventoryOnly = render({ onEditInventory: () => {} }, continuous);
  expect(inventoryOnly).toContain("Lot・分類・保管場所・期限・在庫数を編集する");
  expect(inventoryOnly).not.toContain("商品情報・写真を編集する");
  const productOnly = render({ onEditProduct: () => {} }, continuous);
  expect(productOnly).toContain("商品情報・写真を編集する");
  expect(productOnly).not.toContain("Lot・分類・保管場所・期限・在庫数を編集する");
});
it("hides both editing controls when neither permission is assigned", () => {
  expect(render({})).not.toContain("編集する");
});
