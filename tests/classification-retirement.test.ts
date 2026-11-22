import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";

const auth=vi.hoisted(()=>({isAdmin:true}));
const db=vi.hoisted(()=>({
  $transaction:vi.fn(),
  classification:{findUnique:vi.fn(),upsert:vi.fn(),update:vi.fn()},
  item:{updateMany:vi.fn(),deleteMany:vi.fn()},
  inventoryInstance:{updateMany:vi.fn(),deleteMany:vi.fn()},
  stocktakeTarget:{updateMany:vi.fn(),deleteMany:vi.fn()},
  stocktakeSession:{updateMany:vi.fn(),deleteMany:vi.fn()},
  adminActionLog:{create:vi.fn()},
}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
vi.mock("@/lib/auth",()=>({requireAdmin:()=>auth.isAdmin
  ? {user:{id:"admin"},response:null}
  : {user:null,response:NextResponse.json({code:"FORBIDDEN"},{status:403})},
}));
vi.mock("@/lib/error-report",()=>({createAdminActionLog:vi.fn()}));
import {POST} from "../src/app/api/admin/classifications/route";
const post=(body:Record<string,unknown>)=>POST(new NextRequest("http://localhost/api/admin/classifications",{
  method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
}));
const source={kind:"MAJOR",source:"フリマ3",parentName:"",confirmName:"フリマ3"};
beforeEach(()=>{
  vi.resetAllMocks();auth.isAdmin=true;
  db.$transaction.mockImplementation(async callback=>callback(db));
  db.classification.findUnique.mockResolvedValue({id:"category-1",retiredAt:null});
  db.classification.upsert.mockImplementation(async ({update})=>({id:"category-1",retiredAt:update.retiredAt}));
  db.classification.update.mockResolvedValue({id:"category-1",retiredAt:null});
  db.adminActionLog.create.mockResolvedValue({});
});
describe("classification retirement preserves referenced product and stocktake data",()=>{
  it("requires admin and a reason for retirement",async()=>{
    auth.isAdmin=false;
    expect((await post({action:"RETIRE_CLASSIFICATION",...source,expectedId:"category-1",reason:"整理"})).status).toBe(403);
    auth.isAdmin=true;
    expect((await post({action:"RETIRE_CLASSIFICATION",...source,expectedId:"category-1",reason:""})).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("retires a category even when 19 products and 22 inventory rows exist",async()=>{
    const response=await post({action:"RETIRE_CLASSIFICATION",...source,
      expectedId:"category-1",reason:"分類を整理"});
    expect(response.status).toBe(200);
    expect((await response.json()).code).toBe("CLASSIFICATION_RETIRED");
    expect(db.classification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where:{kind_name_parentName:{kind:"MAJOR",name:"フリマ3",parentName:""}},
      update:expect.objectContaining({retiredAt:expect.any(Date),retirementReason:"分類を整理",retiredByUserId:"admin"}),
    }));
    expect(db.adminActionLog.create.mock.calls[0][0].data).toMatchObject({
      action:"CLASSIFICATION_RETIRE",
      detail:{productClassificationsPreserved:true,inventoryQuantitiesPreserved:true,stocktakeHistoryPreserved:true},
    });
    for(const model of [db.item,db.inventoryInstance,db.stocktakeSession,db.stocktakeTarget]){
      expect(model.updateMany).not.toHaveBeenCalled();
      expect(model.deleteMany).not.toHaveBeenCalled();
    }
  });
  it("supports retiring a category derived only from product records",async()=>{
    db.classification.findUnique.mockResolvedValue(null);
    const response=await post({action:"RETIRE_CLASSIFICATION",...source,expectedId:null,reason:"使わないため"});
    expect(response.status).toBe(200);
    expect(db.classification.upsert.mock.calls[0][0].create).toMatchObject({
      kind:"MAJOR",name:"フリマ3",parentName:"",retirementReason:"使わないため",
    });
  });
  it("restores a retired category without editing product or stock rows",async()=>{
    db.classification.findUnique.mockResolvedValue({id:"category-1",retiredAt:new Date("2026-11-22T00:00:00Z")});
    const response=await post({action:"RESTORE_CLASSIFICATION",...source,expectedId:"category-1"});
    expect(response.status).toBe(200);
    expect(db.classification.update).toHaveBeenCalledWith({
      where:{id:"category-1"},
      data:{retiredAt:null,retirementReason:null,retiredByUserId:null},
    });
    expect(db.item.updateMany).not.toHaveBeenCalled();
    expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();
  });
  it("rejects stale master identity instead of writing to the wrong category",async()=>{
    const response=await post({action:"RETIRE_CLASSIFICATION",...source,expectedId:"old-id",reason:"分類を整理"});
    expect(response.status).toBe(409);
    expect(db.classification.upsert).not.toHaveBeenCalled();
    expect(db.adminActionLog.create).not.toHaveBeenCalled();
  });
});
