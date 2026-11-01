import {beforeEach, expect, it, vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";
const state=vi.hoisted(()=>({admin:true}));
const db=vi.hoisted(()=>({$transaction:vi.fn(),item:{findUnique:vi.fn()},inventoryInstance:{findMany:vi.fn(),updateMany:vi.fn()},storageLocation:{findUnique:vi.fn()},adminActionLog:{create:vi.fn()}}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
vi.mock("@/lib/auth",()=>({requireAdmin:()=>state.admin?{user:{id:"admin",role:"ADMIN"},response:null}:{user:null,response:NextResponse.json({code:"ADMIN_REQUIRED"},{status:403})},getAdminElevation:()=>null}));
import {POST} from "../src/app/api/inventory/bulk/route";
const date="2026-11-01T09:00:00.000Z";
const stocks=["a","b","c"].map(id=>({id,itemId:"item",updatedAt:new Date(date),status:"在庫中",archivedFromStatus:null,allocationType:"home",expirationAlertDays:30,inspectionExcluded:false,inspectionExclusionReason:null,lotNo:id,storageLocationId:null}));
const call=(options:Record<string,unknown>={})=>POST(new NextRequest("http://localhost/api/inventory/bulk",{method:"POST",body:JSON.stringify({itemId:"item",operation:"EXCLUDE_INSPECTION",scope:"selected",selectedIds:["a"],reason:"棚卸対象を整理",snapshots:stocks.map(x=>({id:x.id,expectedUpdatedAt:date})),...options})}));
beforeEach(()=>{vi.resetAllMocks();state.admin=true;db.$transaction.mockImplementation(fn=>fn(db));db.item.findUnique.mockResolvedValue({id:"item",isArchived:false,name:"商品"});db.inventoryInstance.findMany.mockResolvedValue(stocks);db.inventoryInstance.updateMany.mockResolvedValue({count:1});db.adminActionLog.create.mockResolvedValue({});db.storageLocation.findUnique.mockResolvedValue({id:"loc"});});
it("requires administrator authorization before querying database",async()=>{state.admin=false;expect((await call()).status).toBe(403);expect(db.$transaction).not.toHaveBeenCalled();});
it("updates only selected inventory and records before/after in audit",async()=>{const res=await call();expect(res.status).toBe(200);expect((await res.json()).affectedCount).toBe(1);expect(db.inventoryInstance.updateMany).toHaveBeenCalledTimes(1);expect(db.inventoryInstance.updateMany.mock.calls[0][0].where).toMatchObject({id:"a",itemId:"item"});expect(db.adminActionLog.create.mock.calls[0][0].data).toMatchObject({action:"INVENTORY_BULK_EXCLUDE_INSPECTION",detail:{targetIds:["a"]}});});
it("unselected scope excludes only unchecked rows from same item",async()=>{expect((await call({scope:"unselected"})).status).toBe(200);expect(db.inventoryInstance.updateMany.mock.calls.map(c=>c[0].where.id)).toEqual(["b","c"]);});
it("rejects stale versions before any write",async()=>{db.inventoryInstance.findMany.mockResolvedValue(stocks.map((s,i)=>i===1?{...s,updatedAt:new Date("2026-11-01T10:00:00.000Z")}:s));expect((await call()).status).toBe(409);expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();});
it("rejects modified inventory set before any write",async()=>{db.inventoryInstance.findMany.mockResolvedValue(stocks.slice(0,2));expect((await call()).status).toBe(409);expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();});
it("rejects duplicate and out-of-scope IDs",async()=>{expect((await call({selectedIds:["a","a"]})).status).toBe(400);expect((await call({selectedIds:["other"]})).status).toBe(400);});
it("rejects deleted items and rolls back",async()=>{db.item.findUnique.mockResolvedValue({id:"item",isArchived:true,name:"商品"});expect((await call()).status).toBe(409);expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();});

it("soft-deletes selected stock while preserving audit and records",async()=>{
 const response=await call({operation:"DELETE",selectedIds:["b"]});
 expect(response.status).toBe(200);
 expect(db.inventoryInstance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
  where:expect.objectContaining({id:"b"}),
  data:expect.objectContaining({status:"廃止",archivedFromStatus:"在庫中"}),
 }));
 expect(db.adminActionLog.create.mock.calls[0][0].data.action).toBe("INVENTORY_BULK_DELETE");
});
it("restores only deleted stock, not active stock",async()=>{
 db.inventoryInstance.findMany.mockResolvedValue(stocks.map((s,i)=>i===1?{...s,status:"廃止",archivedFromStatus:"在庫中"}:s));
 const response=await call({operation:"RESTORE",selectedIds:["b"]});
 expect(response.status).toBe(200);
 expect(db.inventoryInstance.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:"b"}),data:expect.objectContaining({status:"在庫中",archivedAt:null})}));
 expect(db.adminActionLog.create.mock.calls[0][0].data.action).toBe("INVENTORY_BULK_RESTORE");
});
it("changes location only for reviewed stocks",async()=>{
 expect((await call({operation:"SET_LOCATION",data:{storageLocationId:"loc"}})).status).toBe(200);
 expect(db.storageLocation.findUnique).toHaveBeenCalledWith({where:{id:"loc"},select:{id:true}});
 expect(db.inventoryInstance.updateMany.mock.calls[0][0].data).toEqual({storageLocationId:"loc"});
});
it("blocks invalid allocation and notification day values",async()=>{
 expect((await call({operation:"SET_ALLOCATION",data:{allocationType:"invalid"}})).status).toBe(400);
 expect((await call({operation:"SET_EXPIRY_ALERT",data:{expirationAlertDays:400}})).status).toBe(400);
 expect(db.$transaction).not.toHaveBeenCalled();
});
it("changes allocation and expiry notice settings",async()=>{
 expect((await call({operation:"SET_ALLOCATION",data:{allocationType:"warehouse"}})).status).toBe(200);
 expect(db.inventoryInstance.updateMany.mock.calls[0][0].data).toEqual({allocationType:"warehouse"});
 vi.clearAllMocks();db.$transaction.mockImplementation(fn=>fn(db));db.item.findUnique.mockResolvedValue({id:"item",isArchived:false,name:"商品"});db.inventoryInstance.findMany.mockResolvedValue(stocks);db.inventoryInstance.updateMany.mockResolvedValue({count:1});db.adminActionLog.create.mockResolvedValue({});
 expect((await call({operation:"SET_EXPIRY_ALERT",data:{expirationAlertDays:14}})).status).toBe(200);
 expect(db.inventoryInstance.updateMany.mock.calls[0][0].data).toEqual({expirationAlertDays:14});
});
it("rejects restoring active stock and selected deleted stock for active actions",async()=>{
 expect((await call({operation:"RESTORE"})).status).toBe(409);
 db.inventoryInstance.findMany.mockResolvedValue(stocks.map((s,i)=>i===0?{...s,status:"廃止"}:s));
 expect((await call({operation:"DELETE"})).status).toBe(409);
});
