import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";
const db=vi.hoisted(()=>({storageLocation:{findMany:vi.fn(),findUnique:vi.fn(),create:vi.fn()}}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
vi.mock("@/lib/auth",()=>({requireAdmin:()=>({user:{id:"admin"},response:null})}));
vi.mock("@/lib/error-report",()=>({createAdminActionLog:vi.fn()}));
import {GET,POST} from "../src/app/api/storage-locations/route";

describe("active storage location contract",()=>{
  beforeEach(()=>{vi.clearAllMocks();db.storageLocation.findMany.mockResolvedValue([{id:"active",name:"倉庫",retiredAt:null}]);});
  it("never supplies archived location records to normal location lists",async()=>{
    const response=await GET();
    expect(response.status).toBe(200);
    expect(db.storageLocation.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{retiredAt:null}}));
  });
  it("does not treat retired location as successful duplicate registration",async()=>{
    db.storageLocation.findUnique.mockResolvedValue({id:"retired",name:"倉庫",retiredAt:new Date()});
    const response=await POST(new NextRequest("http://localhost/api/storage-locations",{method:"POST",body:JSON.stringify({name:"倉庫"})}));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("LOCATION_RETIRED");
    expect(db.storageLocation.create).not.toHaveBeenCalled();
  });
});
