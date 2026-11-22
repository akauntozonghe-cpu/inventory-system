import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";

const auth=vi.hoisted(()=>({admin:true}));
const db=vi.hoisted(()=>({
  $transaction:vi.fn(),
  classification:{findUnique:vi.fn()},
  item:{findMany:vi.fn(),updateMany:vi.fn()},
  inventoryInstance:{updateMany:vi.fn()},
  itemRegistrationRequest:{updateMany:vi.fn()},
  stocktakeSession:{updateMany:vi.fn()},
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
  db.$transaction.mockImplementation(async callback=>callback(db));
  db.classification.findUnique.mockResolvedValue(null);
});
describe("classification selection safety",()=>{
  it("rejects unknown merge destinations without editing products",async()=>{
    const response=await post({action:"RENAME_OR_MERGE_CLASSIFICATION",editMode:"MERGE",
      kind:"MAJOR",source:"食品",target:"存在しない分類",reason:"重複を整理"});
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("CLASSIFICATION_MERGE_TARGET_REQUIRED");
    expect(db.item.updateMany).not.toHaveBeenCalled();
  });
  it("rejects assignment to a category absent from the active master",async()=>{
    const response=await post({action:"ASSIGN_ITEMS",itemIds:["item-1"],majorCategory:"未登録"});
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("CLASSIFICATION_TARGET_NOT_ACTIVE");
    expect(db.item.findMany).not.toHaveBeenCalled();
  });
  it("rejects renaming into an already existing category",async()=>{
    db.classification.findUnique.mockResolvedValue({id:"existing",retiredAt:null});
    const response=await post({action:"RENAME_OR_MERGE_CLASSIFICATION",editMode:"RENAME",
      kind:"MAJOR",source:"飲料",target:"食品"});
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("CLASSIFICATION_RENAME_DUPLICATE");
    expect(db.item.updateMany).not.toHaveBeenCalled();
  });
  it("blocks modification for non-administrators",async()=>{
    auth.admin=false;
    expect((await post({action:"RENAME_OR_MERGE_CLASSIFICATION",editMode:"MERGE",kind:"MAJOR",source:"飲料",target:"食品"})).status).toBe(403);
  });
});
