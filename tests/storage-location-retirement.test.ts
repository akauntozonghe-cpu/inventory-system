import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";

const auth=vi.hoisted(()=>({admin:true}));
const db=vi.hoisted(()=>({
  $transaction:vi.fn(),
  storageLocation:{findUnique:vi.fn(),update:vi.fn(),delete:vi.fn()},
  inventoryInstance:{updateMany:vi.fn(),deleteMany:vi.fn()},
  stocktakeSession:{updateMany:vi.fn(),deleteMany:vi.fn()},
  itemRegistrationRequest:{updateMany:vi.fn(),deleteMany:vi.fn()},
  adminActionLog:{create:vi.fn()},
}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
vi.mock("@/lib/auth",()=>({requireAdmin:()=>auth.admin
  ? {user:{id:"admin"},response:null}
  : {user:null,response:NextResponse.json({code:"FORBIDDEN"},{status:403})},
}));
vi.mock("@/lib/error-report",()=>({createAdminActionLog:vi.fn()}));
import {POST} from "../src/app/api/admin/classifications/route";
const post=(body:Record<string,unknown>)=>POST(new NextRequest("http://localhost/api/admin/classifications",{
  method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
}));
beforeEach(()=>{
  vi.resetAllMocks();auth.admin=true;
  db.$transaction.mockImplementation(async f=>f(db));
  db.storageLocation.findUnique.mockResolvedValue({id:"location-1",name:"倉庫",retiredAt:null});
  db.storageLocation.update.mockResolvedValue({id:"location-1",name:"倉庫",retiredAt:new Date()});
  db.adminActionLog.create.mockResolvedValue({});
});
describe("retiring heavily-used locations without rewriting inventory",()=>{
  it("requires an admin, matching name and a reason",async()=>{
    auth.admin=false;
    expect((await post({action:"RETIRE_LOCATION",sourceId:"location-1",confirmName:"倉庫",expectedId:"location-1",reason:"整理"})).status).toBe(403);
    auth.admin=true;
    expect((await post({action:"RETIRE_LOCATION",sourceId:"location-1",confirmName:"倉庫",expectedId:"location-1",reason:""})).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("retires the location, preserving all linked inventory and existing sessions",async()=>{
    const response=await post({action:"RETIRE_LOCATION",sourceId:"location-1",expectedId:"location-1",
      confirmName:"倉庫",reason:"売場整理のため"});
    expect(response.status).toBe(200);
    expect((await response.json()).code).toBe("LOCATION_RETIRED");
    expect(db.storageLocation.update).toHaveBeenCalledWith({
      where:{id:"location-1"},
      data:expect.objectContaining({retiredAt:expect.any(Date),retirementReason:"売場整理のため",retiredByUserId:"admin"}),
    });
    expect(db.adminActionLog.create.mock.calls[0][0].data).toMatchObject({
      action:"CLASSIFICATION_RETIRE_LOCATION",detail:{inventoryLinksPreserved:true,stocktakeHistoryPreserved:true},
    });
    expect(db.storageLocation.delete).not.toHaveBeenCalled();
    for(const model of [db.inventoryInstance,db.stocktakeSession,db.itemRegistrationRequest]){
      expect(model.updateMany).not.toHaveBeenCalled();
      expect(model.deleteMany).not.toHaveBeenCalled();
    }
  });
  it("restores the same storage location ID",async()=>{
    db.storageLocation.findUnique.mockResolvedValue({id:"location-1",name:"倉庫",retiredAt:new Date()});
    const response=await post({action:"RESTORE_LOCATION",sourceId:"location-1",expectedId:"location-1",confirmName:"倉庫"});
    expect(response.status).toBe(200);
    expect(db.storageLocation.update).toHaveBeenCalledWith({
      where:{id:"location-1"},data:{retiredAt:null,retirementReason:null,retiredByUserId:null},
    });
    expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();
  });
  it("does not retire an already retired location or one whose name changed",async()=>{
    db.storageLocation.findUnique.mockResolvedValue({id:"location-1",name:"新倉庫",retiredAt:null});
    expect((await post({action:"RETIRE_LOCATION",sourceId:"location-1",expectedId:"location-1",confirmName:"倉庫",reason:"整理"})).status).toBe(409);
    expect(db.storageLocation.update).not.toHaveBeenCalled();
  });
});
