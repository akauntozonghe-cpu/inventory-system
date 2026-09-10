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
it("edits the assigned code in one field",()=>{
  const html=renderToStaticMarkup(<ProductCodeField janCode="" systemBarcode="2001234567893" onChange={()=>{}}/>);
  expect(html.match(/<input/g)).toHaveLength(1);expect(html).toContain('value="2001234567893"');
});
