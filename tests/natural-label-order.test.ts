import {describe,expect,it} from "vitest";
import {compareLabels} from "../src/lib/natural-label-order";

describe("natural ordering in classification and storage lists",()=>{
  it("orders numeric names by numeric value, not string comparison",()=>{
    const names=["フリマ11","フリマ2","フリマ10","フリマ1"];
    expect([...names].sort(compareLabels)).toEqual(["フリマ1","フリマ2","フリマ10","フリマ11"]);
  });
  it("groups subcategories by parent, and sorts children naturally",()=>{
    const rows=[
      {parentName:"大分類10",name:"小分類11"},
      {parentName:"大分類2",name:"小分類10"},
      {parentName:"大分類2",name:"小分類2"},
      {parentName:"大分類10",name:"小分類1"},
    ];
    const ordered=[...rows].sort((a,b)=>compareLabels(a.parentName,b.parentName)||compareLabels(a.name,b.name));
    expect(ordered.map(x=>x.parentName+"/"+x.name)).toEqual([
      "大分類2/小分類2","大分類2/小分類10","大分類10/小分類1","大分類10/小分類11",
    ]);
  });
});
