import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";
const auth=vi.hoisted(()=>({admin:true}));
const db=vi.hoisted(()=>({
  $transaction:vi.fn(),
  archiveRecord:{findMany:vi.fn(),findUnique:vi.fn()},
  archiveReRegistration:{create:vi.fn()},
  classification:{findUnique:vi.fn(),findMany:vi.fn(),create:vi.fn()},
  storageLocation:{findMany:vi.fn(),create:vi.fn()},
  adminActionLog:{create:vi.fn()},
}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
vi.mock("@/lib/auth",()=>({requireAdmin:()=>auth.admin
  ? {user:{id:"admin"},response:null}
  : {user:null,response:NextResponse.json({code:"FORBIDDEN"},{status:403})}}));
import {GET,POST} from "../src/app/api/admin/archive-records/route";
const post=(body:Record<string,unknown>)=>POST(new NextRequest("http://localhost/api/admin/archive-records",{method:"POST",body:JSON.stringify(body)}));
beforeEach(()=>{
  vi.resetAllMocks();auth.admin=true;
  db.$transaction.mockImplementation(async fn=>fn(db));
  db.archiveRecord.findUnique.mockResolvedValue({id:"archive-1",originalId:"old-1",entityType:"CLASSIFICATION",snapshot:{kind:"MAJOR",name:"フリマ10"}});
  db.classification.findMany.mockResolvedValue([]);
  db.classification.create.mockResolvedValue({id:"new-1",name:"フリマ10"});
  db.storageLocation.findMany.mockResolvedValue([]);
  db.storageLocation.create.mockResolvedValue({id:"new-place"});
  db.archiveReRegistration.create.mockResolvedValue({id:"registration-1"});
  db.adminActionLog.create.mockResolvedValue({});
});
describe("independent archive re-registration",()=>{
  it("restricts both the record list and registration to administrators",async()=>{
    auth.admin=false;
    expect((await GET(new NextRequest("http://localhost/api/admin/archive-records"))).status).toBe(403);
    expect((await post({archiveId:"archive-1",confirmation:"REGISTER_AS_NEW"})).status).toBe(403);
    expect(db.archiveRecord.findMany).not.toHaveBeenCalled();
  });
  it("never reactivates the old record or original ID",async()=>{
    const res=await post({archiveId:"archive-1",confirmation:"REGISTER_AS_NEW"});
    expect(res.status).toBe(201);
    expect((await res.json()).result.newId).toBe("new-1");
    expect(db.classification.create).toHaveBeenCalledWith({data:{kind:"MAJOR",name:"フリマ10",parentName:""}});
    expect(db.archiveReRegistration.create).toHaveBeenCalledWith({data:expect.objectContaining({archiveId:"archive-1",newEntityId:"new-1"})});
    expect(db.archiveRecord).not.toHaveProperty("delete");
    expect(db.adminActionLog.create).toHaveBeenCalled();
  });
  it("requires explicit confirmation and rejects an active duplicate",async()=>{
    expect((await post({archiveId:"archive-1"})).status).toBe(400);
    db.classification.findMany.mockResolvedValue([{name:"フリマ１０"}]);
    const response=await post({archiveId:"archive-1",confirmation:"REGISTER_AS_NEW"});
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("ARCHIVE_DUPLICATE_ACTIVE");
    expect(db.classification.create).not.toHaveBeenCalled();
  });
  it("requires an active parent when re-registering an archived minor",async()=>{
    db.archiveRecord.findUnique.mockResolvedValue({id:"archive-1",originalId:"old-1",entityType:"CLASSIFICATION",snapshot:{kind:"MINOR",name:"毛穴",parentName:"フリマ10"}});
    db.classification.findUnique.mockResolvedValue(null);
    const response=await post({archiveId:"archive-1",confirmation:"REGISTER_AS_NEW"});
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("ARCHIVE_PARENT_REQUIRED");
  });
});
