import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, expect, it, vi } from "vitest";
import ProductIdentity from "../src/components/inventory/ProductIdentity";
import ProductCodeField from "../src/components/ProductCodeField";
vi.stubGlobal("React",React);
afterAll(()=>vi.unstubAllGlobals());
it("shows only the assigned system JAN without exposing internal identifiers or absence labels",()=>{
  const html=renderToStaticMarkup(<ProductIdentity item={{id:"internal-product",janCode:null,systemBarcode:"2001234567893"}} inventoryId="internal-stock"/>);
  expect(html).toContain("システムJAN");expect(html).toContain("2001234567893");
  for(const text of ["未登録","未設定","管理No","在庫No","internal-product","internal-stock"])expect(html).not.toContain(text);
});
it("shows no absence badge when neither barcode is assigned",()=>{
  expect(renderToStaticMarkup(<ProductIdentity item={{id:"internal"}}/>)).toBe("");
});
it("shows assigned system JAN as read-only with an explicit code mode choice",()=>{
  const html=renderToStaticMarkup(<ProductCodeField janCode="" systemBarcode="2001234567893" onChange={()=>{}}/>);
  expect(html.match(/type="radio"/g)).toHaveLength(2);
  expect(html).toContain("2001234567893");
  expect(html).not.toContain('value="2001234567893"');
  expect(html).toContain("システムJANを自動採番");
});
it("asks only for existing JAN numbers and explains automatic numbering",()=>{
  const existing=renderToStaticMarkup(<ProductCodeField janCode="4901234567894" systemBarcode="" onChange={()=>{}}/>);
  expect(existing).toContain('value="4901234567894"');
  const automatic=renderToStaticMarkup(<ProductCodeField janCode="" systemBarcode="" generateSystemBarcode onChange={()=>{}}/>);
  expect(automatic).toContain("保存時に13桁の番号を自動発行します");
  expect(automatic).not.toContain('aria-label="JANコード"');
});
