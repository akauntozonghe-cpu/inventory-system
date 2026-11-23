import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";
const db=vi.hoisted(()=>({classification:{findUnique:vi.fn()},classificationLabelAlias:{findUnique:vi.fn()}}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
vi.mock("@/lib/auth",()=>({requireLogin:()=>({user:{id:"user"},response:null})}));
import {GET} from "../src/app/api/classifications/resolve/route";
const request=(code:string,minor=false)=>new NextRequest("http://localhost/api/classifications/resolve?labelCode="+code+(minor?"&allowMinor=true":""));
beforeEach(()=>{vi.resetAllMocks();db.classification.findUnique.mockResolvedValue(null);db.classificationLabelAlias.findUnique.mockResolvedValue(null);});
describe("classification QR requires active parent and own master",()=>{
  it("rejects a retired direct QR even if labelCode still exists",async()=>{
    db.classification.findUnique.mockResolvedValue({kind:"MAJOR",name:"廃止",parentName:"",retiredAt:new Date()});
    const response=await GET(request("retired"));
    expect(response.status).toBe(410);
    expect((await response.json()).code).toBe("CLASSIFICATION_LABEL_RETIRED");
  });
  it("rejects an active subcategory whose parent is retired",async()=>{
    db.classification.findUnique.mockResolvedValueOnce({kind:"MINOR",name:"菓子",parentName:"食品",retiredAt:null}).mockResolvedValueOnce({id:"major",retiredAt:new Date()});
    const response=await GET(request("child",true));
    expect(response.status).toBe(410);
    expect((await response.json()).code).toBe("CLASSIFICATION_LABEL_PARENT_RETIRED");
  });
  it("resolves a valid active minor in an active parent",async()=>{
    db.classification.findUnique.mockResolvedValueOnce({kind:"MINOR",name:"菓子",parentName:"食品",retiredAt:null}).mockResolvedValueOnce({id:"major",retiredAt:null});
    const response=await GET(request("child",true));
    expect(response.status).toBe(200);
    expect((await response.json()).code).toBe("CLASSIFICATION_LABEL_RESOLVED");
  });
});
