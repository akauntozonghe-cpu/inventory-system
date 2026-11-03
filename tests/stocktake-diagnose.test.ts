import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";

const state=vi.hoisted(()=>({admin:true}));
const db=vi.hoisted(()=>({
  stocktakeSession:{findUnique:vi.fn()},
  stocktakeTarget:{findMany:vi.fn()},
  inventoryInstance:{findMany:vi.fn()},
}));
vi.mock("@/lib/auth",()=>({
  requireAdmin:()=>state.admin
    ? {user:{id:"admin",role:"ADMIN"},response:null}
    : {user:null,response:NextResponse.json({code:"FORBIDDEN"},{status:403})},
}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
import {GET} from "../src/app/api/stocktake/diagnose/route";

const request=(q="テスト",sessionId="session")=>GET(new NextRequest(
  "http://localhost/api/stocktake/diagnose?sessionId="+sessionId+"&q="+encodeURIComponent(q)
));

const baseStock={
  id:"stock",itemId:"item",lotNo:"LOT-A",quantity:10,status:"在庫中",inspectionExcluded:false,
  majorCategory:null,minorCategory:null,storageLocation:{name:"棚A"},
  item:{id:"item",name:"テスト商品",janCode:"4901234567894",systemBarcode:null,isArchived:false,
    inspectionExcluded:false,majorCategory:"食品",minorCategory:"菓子"},
};
beforeEach(()=>{
  vi.resetAllMocks();state.admin=true;
  db.stocktakeSession.findUnique.mockResolvedValue({id:"session",title:"テスト棚卸",scopeType:"ALL",scopeValue:null,status:"IN_PROGRESS"});
  db.inventoryInstance.findMany.mockResolvedValue([baseStock]);
  db.stocktakeTarget.findMany.mockResolvedValue([{inventoryInstanceId:"stock"}]);
});
it("never searches inventory unless administrator",async()=>{
  state.admin=false;
  expect((await request()).status).toBe(403);
  expect(db.inventoryInstance.findMany).not.toHaveBeenCalled();
});
it("rejects empty diagnosis without a DB query",async()=>{
  expect((await request("a")).status).toBe(400);
  expect(db.stocktakeSession.findUnique).not.toHaveBeenCalled();
});
it("identifies a stock already enrolled in the stocktake",async()=>{
  const response=await request();
  expect(response.status).toBe(200);
  expect((await response.json()).stocks[0]).toMatchObject({
    inSession:true,visibleInUnfilteredList:true,reasons:[],
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("explains why an exempt inventory is not visible",async()=>{
  db.inventoryInstance.findMany.mockResolvedValue([{...baseStock,inspectionExcluded:true}]);
  const response=await request();
  expect((await response.json()).stocks[0]).toMatchObject({
    inSession:true,visibleInUnfilteredList:false,reasons:["在庫明細が棚卸対象外"],
  });
});
it("explains omitted inventory outside the selected location",async()=>{
  db.stocktakeSession.findUnique.mockResolvedValue({id:"session",title:"棚卸",scopeType:"LOCATION",scopeValue:"棚B",status:"IN_PROGRESS"});
  db.stocktakeTarget.findMany.mockResolvedValue([]);
  const result=await (await request()).json();
  expect(result.stocks[0]).toMatchObject({inSession:false,scopeMatches:false});
  expect(result.stocks[0].reasons).toContain("今回の棚卸範囲（分類・場所）に含まれない");
});
it("does not mark an enrolled stock omitted just because its location moved",async()=>{
  db.stocktakeSession.findUnique.mockResolvedValue({id:"session",title:"棚卸",scopeType:"LOCATION",scopeValue:"棚B",status:"IN_PROGRESS"});
  expect((await (await request()).json()).stocks[0]).toMatchObject({
    inSession:true,scopeMatches:false,visibleInUnfilteredList:true,reasons:[],
  });
});
it("reports unregistered stock and suggests live refresh",async()=>{
  db.stocktakeTarget.findMany.mockResolvedValue([]);
  const result=await (await request()).json();
  expect(result.stocks[0].reasons[0]).toContain("まだ登録されていない");
  expect(db.inventoryInstance.findMany.mock.calls[0][0].take).toBe(51);
});
