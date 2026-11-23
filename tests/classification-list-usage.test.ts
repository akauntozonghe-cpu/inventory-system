import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";

const db=vi.hoisted(()=>({
  $transaction:vi.fn(),
  classification:{findMany:vi.fn()},
  item:{findMany:vi.fn()},
  storageLocation:{findMany:vi.fn()},
}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
vi.mock("@/lib/auth",()=>({requireAdmin:()=>({user:{id:"admin"},response:null})}));
vi.mock("@/lib/error-report",()=>({createAdminActionLog:vi.fn()}));
import {GET} from "../src/app/api/admin/classifications/route";

const item=(index:number,isArchived=false)=>({
  id:"item-"+index,name:"商品"+index,isArchived,janCode:null,systemBarcode:null,
  managementCode:null,majorCategory:"食品",minorCategory:"菓子",
  defaultUnit:"個",inventoryInstances:[],_count:{inventoryInstances:0},
});
beforeEach(()=>{
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async callback=>callback(db));
  db.classification.findMany.mockResolvedValue([
    {id:"cat-main",kind:"MAJOR",name:"食品",parentName:""},
    {id:"cat-sub",kind:"MINOR",name:"菓子",parentName:"食品"},
  ]);
  db.storageLocation.findMany.mockResolvedValue([]);
});
it("shows 11 linked product masters even when all their inventory detail counts are zero",async()=>{
  db.item.findMany.mockResolvedValue(Array.from({length:11},(_,i)=>item(i)));
  const response=await GET(new NextRequest("http://localhost/api/admin/classifications"));
  expect(response.status).toBe(200);
  const data=await response.json();
  expect(data.classifications).toEqual(expect.arrayContaining([
    expect.objectContaining({kind:"MAJOR",name:"食品",itemCount:11,inventoryCount:0,archivedItemCount:0}),
    expect.objectContaining({kind:"MINOR",name:"菓子",parentName:"食品",itemCount:11,inventoryCount:0,archivedItemCount:0}),
  ]));
  expect(data.items).toHaveLength(11);
  const category=data.classifications.find((row:{kind:string})=>row.kind==="MAJOR");
  expect(category.linkedItems.map((item:{name:string})=>item.name)).toEqual(
    Array.from({length:11},(_,i)=>"商品"+i)
  );
});
it("keeps archived products out of active usage counts while reporting historical references",async()=>{
  db.item.findMany.mockResolvedValue([item(1),item(2,true),item(3)]);
  const response=await GET(new NextRequest("http://localhost/api/admin/classifications"));
  const data=await response.json();
  expect(data.classifications.find((row:{kind:string})=>row.kind==="MAJOR"))
    .toMatchObject({itemCount:2,archivedItemCount:1,inventoryCount:0});
  const archived=data.classifications.find((row:{kind:string})=>row.kind==="MAJOR").linkedItems;
  expect(archived.some((row:{id:string})=>row.id==="item-2")).toBe(false);
  // Historical / archived product references are counted but not editable.
  expect(data.items.map((row:{id:string})=>row.id)).toEqual(["item-1","item-3"]);
  expect(db.item.findMany.mock.calls[0][0].where).toBeUndefined();
});
