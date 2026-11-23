import {describe,expect,it} from "vitest";
import {activePrintCatalog,type LabelCatalog} from "../src/components/LabelPrintPanel";

describe("QR print catalog consistency with active masters",()=>{
  const catalog:LabelCatalog={
    items:[{id:"item-1",name:"現役商品",janCode:"4901234567894",systemBarcode:null}],
    classifications:[
      {id:"major-1",kind:"MAJOR",name:"現役",parentName:"",retiredAt:null},
      {id:"minor-1",kind:"MINOR",name:"小分類A",parentName:"現役",retiredAt:null},
      {id:"major-old",kind:"MAJOR",name:"廃止済み",parentName:"",retiredAt:"2026-11-01T00:00:00Z"},
      {id:"minor-orphan",kind:"MINOR",name:"旧小分類",parentName:"廃止済み",retiredAt:null},
      {id:"minor-retired",kind:"MINOR",name:"廃止小分類",parentName:"現役",retiredAt:"2026-11-01T00:00:00Z"},
    ],
    locations:[
      {id:"location-1",name:"保管場所A",retiredAt:null},
      {id:"location-old",name:"廃止場所",retiredAt:"2026-11-01T00:00:00Z"},
    ],
  };
  it("offers only active classifications, including minors under an active major",()=>{
    expect(activePrintCatalog(catalog).classifications.map(x=>x.id)).toEqual(["major-1","minor-1"]);
  });
  it("excludes retired storage locations",()=>{
    expect(activePrintCatalog(catalog).locations.map(x=>x.id)).toEqual(["location-1"]);
  });
  it("keeps legitimate active products unchanged",()=>{
    expect(activePrintCatalog(catalog).items).toEqual(catalog.items);
  });
});
