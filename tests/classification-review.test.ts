import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const db=vi.hoisted(()=>({$transaction:vi.fn(),item:{findMany:vi.fn(),updateMany:vi.fn()},inventoryInstance:{updateMany:vi.fn()},classification:{findUnique:vi.fn(),upsert:vi.fn()},adminActionLog:{create:vi.fn()}}));
vi.mock("@/lib/prisma",()=>({prisma:db}));vi.mock("@/lib/auth",()=>({requireAdmin:()=>({user:{id:"admin"},response:null})}));vi.mock("@/lib/error-report",()=>({createAdminActionLog:vi.fn()}));
import {POST} from "../src/app/api/admin/classifications/route";
const before={id:"p1",majorCategory:"食品",minorCategory:"飲料"};
const body={action:"ASSIGN_ITEMS",itemIds:["p1"],majorCategory:"備品",minorCategory:"消耗品",expectedClassifications:[before]};
const request=(value:unknown)=>new NextRequest("http://localhost/api/admin/classifications",{method:"POST",body:JSON.stringify(value)});
beforeEach(()=>{vi.resetAllMocks();db.$transaction.mockImplementation(async fn=>fn(db));db.item.findMany.mockResolvedValue([before]);db.item.updateMany.mockResolvedValue({count:1});db.inventoryInstance.updateMany.mockResolvedValue({count:1});db.classification.upsert.mockResolvedValue({});db.classification.findUnique.mockResolvedValue({id:"existing-classification",retiredAt:null});db.adminActionLog.create.mockResolvedValue({});});
it("assigns an existing active major/minor without carrying an unrelated old subcategory",async()=>{
 expect((await POST(request(body)))?.status).toBe(200);
 expect(db.item.updateMany).toHaveBeenCalledWith({where:{id:"p1",isArchived:false,majorCategory:"食品",minorCategory:"飲料"},data:{majorCategory:"備品",minorCategory:"消耗品"}});
 expect(db.inventoryInstance.updateMany).toHaveBeenCalledWith({where:{itemId:"p1",status:{not:"廃止"},majorCategory:"食品"},data:{majorCategory:"備品"}});
 expect(db.inventoryInstance.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{minorCategory:"消耗品"}}));
 expect(db.inventoryInstance.updateMany).toHaveBeenCalledTimes(2);
 expect(db.classification.upsert).not.toHaveBeenCalled();
 expect(db.adminActionLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({action:"CLASSIFICATION_ASSIGN_ITEMS"})}));
 expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),expect.objectContaining({isolationLevel:"Serializable"}));
});
it("does not overwrite a classification changed after the review opened",async()=>{
 db.item.findMany.mockResolvedValue([{...before,minorCategory:"加工品"}]);
 expect((await POST(request(body)))?.status).toBe(409);expect(db.item.updateMany).not.toHaveBeenCalled();expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();
});
it("rejects malformed before-state data before starting a transaction",async()=>{
 expect((await POST(request({...body,expectedClassifications:[null]})))?.status).toBe(400);expect(db.$transaction).not.toHaveBeenCalled();
});
