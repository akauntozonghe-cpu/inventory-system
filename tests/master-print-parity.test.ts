import {describe,expect,it} from "vitest";
import {selectActiveMasters} from "../src/lib/active-master-catalog";
import {activePrintCatalog} from "../src/components/LabelPrintPanel";
const data={
  items:[{id:"item",name:"商品",janCode:"4901234567894",systemBarcode:null}],
  classifications:[
    {id:"ma-2",kind:"MAJOR",name:"フリマ10",parentName:"",retiredAt:null},
    {id:"ma-1",kind:"MAJOR",name:"フリマ2",parentName:"",retiredAt:null},
    {id:"mi-1",kind:"MINOR",name:"毛穴",parentName:"フリマ2",retiredAt:null},
    {id:"mi-2",kind:"MINOR",name:"高保湿",parentName:"フリマ10",retiredAt:null},
    {id:"mi-old",kind:"MINOR",name:"旧分類",parentName:"フリマ10",retiredAt:"2026-11-01"},
    {id:"ma-old",kind:"MAJOR",name:"廃止",parentName:"",retiredAt:"2026-11-01"},
    {id:"mi-orphan",kind:"MINOR",name:"旧分類の子",parentName:"廃止",retiredAt:null},
  ],
  locations:[
    {id:"lo-2",name:"倉庫10",retiredAt:null},
    {id:"lo-1",name:"倉庫2",retiredAt:null},
    {id:"lo-old",name:"旧倉庫",retiredAt:"2026-11-01"},
  ],
};
describe("management and QR print share the exact same active master identity set",()=>{
  it("returns precisely the same major and minor IDs, irrespective of parent selection in the editor",()=>{
    const m=selectActiveMasters(data.classifications,data.locations);
    const printed=activePrintCatalog(data);
    expect(m.majors.map(x=>x.id)).toEqual(printed.classifications.filter(x=>x.kind==="MAJOR").map(x=>x.id));
    expect(m.minors.map(x=>x.id)).toEqual(printed.classifications.filter(x=>x.kind==="MINOR").map(x=>x.id));
    expect(m.minors.map(x=>x.name)).toEqual(["高保湿","毛穴"]);
    expect(printed.classifications.map(x=>x.id)).not.toContain("mi-orphan");
  });
  it("returns precisely the same active location IDs in natural numeric order",()=>{
    const m=selectActiveMasters(data.classifications,data.locations);
    const printed=activePrintCatalog(data);
    expect(m.locations.map(x=>x.id)).toEqual(printed.locations.map(x=>x.id));
    expect(m.locations.map(x=>x.name)).toEqual(["倉庫2","倉庫10"]);
  });
});
