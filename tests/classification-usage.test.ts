import { describe, expect, it } from "vitest";
import {buildClassificationUsageRows} from "../src/lib/classification-usage";

describe("classification usage matches stored Item classifications, not quantity",()=>{
  const masters=[
    {id:"major",kind:"MAJOR",parentName:"",name:"食品"},
    {id:"minor",kind:"MINOR",parentName:"食品",name:"菓子"},
  ];
  const item=(n:number,isArchived=false,inventoryInstances=0)=>({
    id:String(n),isArchived,majorCategory:"食品",minorCategory:"菓子",
    _count:{inventoryInstances},
  });

  it("shows 11 linked products even with zero inventory rows and zero quantities",()=>{
    const rows=buildClassificationUsageRows(masters,Array.from({length:11},(_,i)=>item(i)));
    expect(rows).toHaveLength(2);
    expect(rows.find(row=>row.kind==="MAJOR")).toMatchObject({
      id:"major",itemCount:11,inventoryCount:0,archivedItemCount:0,
    });
    expect(rows.find(row=>row.kind==="MINOR")).toMatchObject({
      id:"minor",itemCount:11,inventoryCount:0,archivedItemCount:0,
    });
  });
  it("counts deleted product references while keeping inventory counts independent",()=>{
    const rows=buildClassificationUsageRows(masters,[item(1,true,0),item(2,false,3)]);
    expect(rows[0]).toMatchObject({itemCount:2,archivedItemCount:1,inventoryCount:3});
    expect(rows[1]).toMatchObject({itemCount:2,archivedItemCount:1,inventoryCount:3});
  });
  it("does not silently show zero for categories present only in products",()=>{
    const rows=buildClassificationUsageRows([],Array.from({length:11},(_,i)=>item(i)));
    expect(rows).toHaveLength(2);
    expect(rows.every(row=>row.itemCount===11)).toBe(true);
  });
  it("handles colon characters in a category and does not create separate duplicates",()=>{
    const rows=buildClassificationUsageRows(
      [{id:"master",kind:"MINOR",parentName:"備品",name:"A:B"}],
      [{majorCategory:"備品",minorCategory:"A:B",isArchived:false,_count:{inventoryInstances:0}}],
    );
    const minor=rows.filter(row=>row.kind==="MINOR");
    expect(minor).toHaveLength(1);
    expect(minor[0]).toMatchObject({id:"master",name:"A:B",itemCount:1});
  });
  it("never treats a product's physical quantity as its linked-product count",()=>{
    const rows=buildClassificationUsageRows(masters,[
      {majorCategory:"食品",minorCategory:"菓子",isArchived:false,_count:{inventoryInstances:10}},
    ]);
    expect(rows[0]).toMatchObject({itemCount:1,inventoryCount:10});
  });
});
