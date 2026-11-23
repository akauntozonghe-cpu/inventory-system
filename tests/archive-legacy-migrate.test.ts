import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";
const state=vi.hoisted(()=>({admin:true}));
const db=vi.hoisted(()=>({
  $transaction:vi.fn(),archiveRecord:{create:vi.fn()},classification:{findUnique:vi.fn(),delete:vi.fn()},
  storageLocation:{findUnique:vi.fn(),delete:vi.fn()},
  inventoryInstance:{count:vi.fn()},itemRegistrationRequest:{count:vi.fn()},
  stocktakeSession:{count:vi.fn()},adminActionLog:{create:vi.fn()},
}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
vi.mock("@/lib/auth",()=>({requireAdmin:()=>state.admin?{user:{id:"admin"},response:null}:{user:null,response:NextResponse.json({code:"FORBIDDEN"},{status:403})}}));
import {POST} from "../src/app/api/admin/archive-migrate/route";
const request=(body:Record<string,unknown>)=>POST(new NextRequest("http://localhost/api/admin/archive-migrate",{method:"POST",body:JSON.stringify(body)}));
const input={entityType:"STORAGE_LOCATION",id:"old-location"};
beforeEach(()=>{
  vi.resetAllMocks();state.admin=true;db.$transaction.mockImplementation(async callback=>callback(db));
  db.storageLocation.findUnique.mockResolvedValue({id:"old-location",name:"旧倉庫",retiredAt:new Date("2026-11-01"),retirementReason:"棚を整理"});
  db.storageLocation.delete.mockResolvedValue({id:"old-location"});
  db.inventoryInstance.count.mockResolvedValue(0);
  db.itemRegistrationRequest.count.mockResolvedValue(0);
  db.stocktakeSession.count.mockResolvedValue(0);
  db.archiveRecord.create.mockResolvedValue({id:"archive-1"});
});
describe("legacy archive migration is restricted and transactional",()=>{
  it("never reads retired location data without admin access",async()=>{
    state.admin=false;
    expect((await request({...input,mode:"PREVIEW"})).status).toBe(403);
    expect(db.storageLocation.findUnique).not.toHaveBeenCalled();
  });
  it("previews dependencies without writing anything",async()=>{
    const response=await request({...input,mode:"PREVIEW"});
    expect(response.status).toBe(200);
    expect((await response.json()).result).toMatchObject({migrated:false,eligible:true});
    expect(db.archiveRecord.create).not.toHaveBeenCalled();
    expect(db.storageLocation.delete).not.toHaveBeenCalled();
  });
  it("atomically saves an immutable snapshot before deleting a safe retired master",async()=>{
    const response=await request({...input,mode:"MIGRATE",confirmId:"old-location"});
    expect(response.status).toBe(200);
    expect((await response.json()).result).toMatchObject({migrated:true,archiveRecordId:"archive-1"});
    expect(db.archiveRecord.create).toHaveBeenCalledWith({data:expect.objectContaining({
      originalId:"old-location",entityType:"STORAGE_LOCATION",snapshot:expect.objectContaining({name:"旧倉庫"}),
    })});
    expect(db.storageLocation.delete).toHaveBeenCalledWith({where:{id:"old-location"}});
    expect(db.adminActionLog.create).toHaveBeenCalled();
  });
  it("does not delete a location when inventory still references it",async()=>{
    db.inventoryInstance.count.mockResolvedValue(2);
    const response=await request({...input,mode:"MIGRATE",confirmId:"old-location"});
    expect(response.status).toBe(409);
    expect(db.archiveRecord.create).not.toHaveBeenCalled();
    expect(db.storageLocation.delete).not.toHaveBeenCalled();
  });
  it("rejects migration of an active master",async()=>{
    db.storageLocation.findUnique.mockResolvedValue({id:"old-location",name:"倉庫",retiredAt:null});
    const response=await request({...input,mode:"MIGRATE",confirmId:"old-location"});
    expect(response.status).toBe(409);
    expect(db.archiveRecord.create).not.toHaveBeenCalled();
  });
});
