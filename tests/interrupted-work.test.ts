import {describe,expect,it} from "vitest";
import {parseInterruptedWork,safeWorkReturn} from "../src/lib/interrupted-work";

describe("temporary work navigation",()=>{
  it("accepts a safe internal return with a whitelisted workflow tab",()=>{
    expect(safeWorkReturn("/admin/classifications?view=PRINT")).toBe("/admin/classifications?view=PRINT");
  });
  it("rejects external and malformed return destinations",()=>{
    expect(safeWorkReturn("https://example.com")).toBeNull();
    expect(safeWorkReturn("//example.com")).toBeNull();
    expect(safeWorkReturn("/\\example.com")).toBeNull();
  });
  it("restores a recent draft but expires stale sessions",()=>{
    const now=1795392000000;
    const context={returnTo:"/admin/classifications?view=ITEMS",title:"分類整理",detail:"選択中",startedAt:now-2000};
    expect(parseInterruptedWork(JSON.stringify(context),now)).toEqual(context);
    expect(parseInterruptedWork(JSON.stringify({...context,startedAt:now-13*60*60*1000}),now)).toBeNull();
  });
});
