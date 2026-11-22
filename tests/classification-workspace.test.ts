import {describe,expect,it} from "vitest";
import {
  CLASSIFICATION_WORKSPACE_KEY,
  classificationItemHref,
  classificationReturnTo,
  classificationView,
  parseClassificationWorkspace,
} from "../src/lib/classification-workspace";

describe("classification navigation and work restoration",()=>{
  it("creates a product link carrying a return destination",()=>{
    const href=classificationItemHref("item 1");
    expect(href.startsWith("/items/item%201?")).toBe(true);
    const url=new URL(href,"https://inventory.invalid");
    expect(classificationReturnTo(url.searchParams.get("returnTo"))).toBe("/admin/classifications?view=ITEMS");
    expect(classificationItemHref("product", "lot")).toContain("inventoryId=lot");
  });
  it("allows only a known classification page and tab as a return destination",()=>{
    expect(classificationReturnTo("/admin/classifications")).toBe("/admin/classifications");
    expect(classificationReturnTo("/admin/classifications?view=MASTERS")).toBe("/admin/classifications?view=MASTERS");
    for(const value of [
      "https://example.com/admin/classifications",
      "//example.com/admin/classifications",
      "/admin/classifications-evil",
      "/admin/classifications?view=UNKNOWN",
      "/admin/classifications?next=https://example.com",
      "/admin/classifications/../../reset",
    ]) expect(classificationReturnTo(value)).toBeNull();
    expect(classificationView("PRINT")).toBe("PRINT");
    expect(classificationView("UNKNOWN")).toBeNull();
  });
  it("restores exact filters and selected products without duplicate or invalid IDs",()=>{
    const state=parseClassificationWorkspace(JSON.stringify({
      view:"ITEMS",itemSearch:"コーヒー",masterSearch:"",majorFilter:"食品",
      minorFilter:"飲料",locationFilter:"location-1",
      selectedOnly:true,selectedIds:["a","a","b",null,14],page:4,
    }));
    expect(state).toMatchObject({
      view:"ITEMS",itemSearch:"コーヒー",majorFilter:"食品",
      minorFilter:"飲料",locationFilter:"location-1",
      selectedOnly:true,selectedIds:["a","b"],page:4,
    });
    expect(CLASSIFICATION_WORKSPACE_KEY).toContain("classification-workspace");
  });
  it("safely rejects malformed stale storage and bounds saved values",()=>{
    expect(parseClassificationWorkspace("invalid")).toBeNull();
    expect(parseClassificationWorkspace(JSON.stringify({view:"UNKNOWN"}))).toBeNull();
    const saved=parseClassificationWorkspace(JSON.stringify({
      view:"MASTERS",itemSearch:"あ".repeat(1000),
      selectedIds:Array.from({length:600},(_,i)=>String(i)),page:999999,
    }));
    expect(saved?.itemSearch).toHaveLength(200);
    expect(saved?.selectedIds).toHaveLength(500);
    expect(saved?.page).toBe(100000);
  });
});
