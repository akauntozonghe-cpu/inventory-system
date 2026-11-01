import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { inspectionInventoryWhere } from "../src/lib/product-scope";
import { inventoryCategoryWhere } from "../src/lib/inventory-category";

const session=vi.hoisted(()=>({loggedIn:true}));
const db=vi.hoisted(()=>({
  inventoryInstance:{findMany:vi.fn()},
  stocktakeSession:{create:vi.fn()},
}));
vi.mock("@/lib/auth",()=>({getLoggedInUser:()=>session.loggedIn?{id:"worker",displayName:"作業者"}:null}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
import { POST } from "../src/app/api/stocktake/start/route";

const start=(scopeType:"ALL"|"LOCATION"|"MAJOR_CATEGORY"|"MINOR_CATEGORY",scopeValue?:string)=>
  POST(new NextRequest("http://localhost/api/stocktake/start",{
    method:"POST",body:JSON.stringify({title:"棚卸確認",scopeType,scopeValue}),
  }));

beforeEach(()=>{
  vi.resetAllMocks();session.loggedIn=true;
  db.inventoryInstance.findMany.mockResolvedValue([{id:"lot-1",quantity:5}]);
  db.stocktakeSession.create.mockResolvedValue({id:"session",_count:{targets:1}});
});

it("excludes deleted and inspection-exempt inventory when starting a whole-stocktake session",async()=>{
  expect((await start("ALL")).status).toBe(201);
  expect(db.inventoryInstance.findMany.mock.calls[0][0].where).toEqual({AND:[inspectionInventoryWhere]});
  expect(db.stocktakeSession.create.mock.calls[0][0].data.targets.create).toEqual([{inventoryInstanceId:"lot-1",expectedQuantity:5}]);
});

it("combines parent-product category inheritance with the common inspection scope",async()=>{
  expect((await start("MAJOR_CATEGORY","食品")).status).toBe(201);
  expect(db.inventoryInstance.findMany.mock.calls[0][0].where).toEqual({
    AND:[inspectionInventoryWhere,inventoryCategoryWhere("majorCategory","食品")],
  });
});

it("preserves the common exclusion rule for a partial location stocktake",async()=>{
  expect((await start("LOCATION","倉庫")).status).toBe(201);
  expect(db.inventoryInstance.findMany.mock.calls[0][0].where).toMatchObject({
    AND:[inspectionInventoryWhere],storageLocation:{is:{name:"倉庫"}},
  });
});

it("rejects unauthenticated stocktake creation before database access",async()=>{
  session.loggedIn=false;
  expect((await start("ALL")).status).toBe(401);
  expect(db.inventoryInstance.findMany).not.toHaveBeenCalled();
});
