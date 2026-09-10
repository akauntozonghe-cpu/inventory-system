import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";
const state=vi.hoisted(()=>({role:"ADMIN",elevated:false}));
const db=vi.hoisted(()=>({$transaction:vi.fn(),item:{findMany:vi.fn(),updateMany:vi.fn()},marketplaceListing:{count:vi.fn()},stocktakeTarget:{count:vi.fn()},adminActionLog:{create:vi.fn()}}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
vi.mock("@/lib/auth",()=>({requireAdmin:()=>state.role==="ADMIN"||state.elevated?{user:{id:"actor",role:state.role}}:{response:NextResponse.json({code:"ADMIN_REQUIRED"},{status:403})},getAdminElevation:()=>state.elevated?{adminUserId:"sponsor"}:null}));
import {POST} from "../src/app/api/items/bulk/route";
import {activeInventoryWhere,isInspectionTarget,productCodes} from "../src/lib/product-scope";
const request=(operation:string,reason="管理上問題なし")=>POST(new NextRequest("http://localhost/api/items/bulk",{method:"POST",body:JSON.stringify({operation,itemIds:["item"],reason})}));
beforeEach(()=>{vi.resetAllMocks();state.role="ADMIN";state.elevated=false;db.$transaction.mockImplementation(fn=>fn(db));db.item.findMany.mockResolvedValue([{id:"item",isArchived:false}]);db.item.updateMany.mockResolvedValue({count:1});db.marketplaceListing.count.mockResolvedValue(0);db.stocktakeTarget.count.mockResolvedValue(0);});
it("excludes retired and explicitly exempt products without removing exempt active stock",()=>{
 expect(isInspectionTarget({isArchived:true})).toBe(false);expect(isInspectionTarget({inspectionExcluded:true})).toBe(false);expect(isInspectionTarget({},"廃止")).toBe(false);expect(isInspectionTarget({})).toBe(true);
 expect(activeInventoryWhere.item).not.toHaveProperty("inspectionExcluded");
});
it("keeps management identity independent from JAN and lot inventory identity",()=>{
 expect(productCodes({id:"item-1",janCode:"4901234567894"})).toEqual({managementNo:"item-1",label:"JAN",code:"4901234567894"});
 expect(productCodes({id:"item-1",systemBarcode:"2001234567893"})).toMatchObject({managementNo:"item-1",label:"システムJAN"});
});
it("rejects workers and missing reasons before any database operation",async()=>{
 state.role="WORKER";expect((await request("EXCLUDE_INSPECTION"))?.status).toBe(403);state.role="ADMIN";expect((await request("EXCLUDE_INSPECTION",""))?.status).toBe(400);expect(db.$transaction).not.toHaveBeenCalled();
});
it("records exclusion and its administrator reason in one transaction without archiving",async()=>{
 expect((await request("EXCLUDE_INSPECTION"))?.status).toBe(200);
 expect(db.item.updateMany).toHaveBeenCalledWith({where:{id:{in:["item"]}},data:{inspectionExcluded:true,inspectionExclusionReason:"管理上問題なし"}});
 expect(db.adminActionLog.create.mock.calls[0][0].data).toMatchObject({adminUserId:"actor",detail:{reason:"管理上問題なし"}});
 expect(db.$transaction.mock.calls[0][1]).toMatchObject({isolationLevel:"Serializable"});
});
it("attributes elevated operations to the authorizing administrator",async()=>{state.role="WORKER";state.elevated=true;await request("EXCLUDE_INSPECTION");expect(db.adminActionLog.create.mock.calls[0][0].data).toMatchObject({adminUserId:"sponsor",detail:{requestedBy:"actor"}});});
it.each(["stocktakeTarget","marketplaceListing"] as const)("blocks archiving products reserved by %s",async model=>{db[model].count.mockResolvedValue(1);expect((await request("ARCHIVE"))?.status).toBe(409);expect(db.item.updateMany).not.toHaveBeenCalled();});
it("restores inspection without touching the archived state",async()=>{await request("INCLUDE_INSPECTION");expect(db.item.updateMany.mock.calls[0][0].data).toEqual({inspectionExcluded:false,inspectionExclusionReason:null});});
it("fails the entire operation when the audit cannot be saved",async()=>{db.adminActionLog.create.mockRejectedValue(new Error("audit unavailable"));expect((await request("EXCLUDE_INSPECTION"))?.status).toBe(409);});
