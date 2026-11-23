import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";
const state=vi.hoisted(()=>({isAdmin:true}));
const db=vi.hoisted(()=>({
  item:{count:vi.fn(),groupBy:vi.fn()},
  inventoryInstance:{count:vi.fn()},
  classification:{count:vi.fn(),findMany:vi.fn()},
  storageLocation:{count:vi.fn()},
  itemRegistrationRequest:{count:vi.fn()},
}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
vi.mock("@/lib/auth",()=>({requireAdmin:()=>state.isAdmin?{user:{id:"admin"},response:null}:{response:NextResponse.json({code:"FORBIDDEN"},{status:403})}}));
import {GET} from "../src/app/api/admin/archive-audit/route";
const req=()=>new NextRequest("http://localhost/api/admin/archive-audit");
beforeEach(()=>{
  vi.resetAllMocks();state.isAdmin=true;
  for(const model of [db.item,db.inventoryInstance,db.classification,db.storageLocation,db.itemRegistrationRequest])model.count.mockResolvedValue(0);
  db.classification.findMany.mockResolvedValue([{kind:"MAJOR",name:"食品",parentName:""},{kind:"MINOR",name:"菓子",parentName:"食品"}]);
  db.item.groupBy.mockResolvedValue([{majorCategory:"食品",minorCategory:"菓子",_count:{_all:2}}]);
});
describe("archive migration preflight",()=>{
  it("requires administrator access before reading counts",async()=>{
    state.isAdmin=false;
    expect((await GET(req())).status).toBe(403);
    expect(db.item.count).not.toHaveBeenCalled();
  });
  it("reports active and archive records without mutating any table",async()=>{
    const response=await GET(req());
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(body.status).toBe("AUDIT_ONLY");
    expect(body.blockers.activeItemsWithUnregisteredClassification).toBe(0);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(Object.keys(db.item).sort()).toEqual(["count","groupBy"]);
  });
  it("detects active products pointing at a category missing from active master",async()=>{
    db.item.groupBy.mockResolvedValue([{majorCategory:"廃止済み",minorCategory:null,_count:{_all:3}}]);
    const response=await GET(req());
    const result=await response.json();
    expect(result.blockers.activeItemsWithUnregisteredClassification).toBe(3);
    expect(result.knownBlockersClear).toBe(false);
  });
});
