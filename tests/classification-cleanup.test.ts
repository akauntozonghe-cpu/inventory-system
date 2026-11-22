import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";
const authState=vi.hoisted(()=>({admin:true}));
const db=vi.hoisted(()=>({
  $transaction:vi.fn(),
  classification:{findUnique:vi.fn(),count:vi.fn(),delete:vi.fn(),upsert:vi.fn()},
  item:{count:vi.fn(),findMany:vi.fn(),updateMany:vi.fn()},
  inventoryInstance:{count:vi.fn(),updateMany:vi.fn(),delete:vi.fn()},
  itemRegistrationRequest:{count:vi.fn(),updateMany:vi.fn()},
  stocktakeSession:{count:vi.fn(),updateMany:vi.fn()},
  storageLocation:{findUnique:vi.fn(),delete:vi.fn()},
  stocktakeTarget:{deleteMany:vi.fn()},stocktakeRecord:{deleteMany:vi.fn()},
  adminActionLog:{create:vi.fn()},
}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
vi.mock("@/lib/auth",()=>({requireAdmin:()=>authState.admin
  ? {user:{id:"admin",role:"ADMIN"},response:null}
  : {user:null,response:NextResponse.json({code:"FORBIDDEN"},{status:403})},
}));
vi.mock("@/lib/error-report",()=>({createAdminActionLog:vi.fn()}));
import {POST} from "../src/app/api/admin/classifications/route";

const post=(body:Record<string,unknown>)=>POST(new NextRequest("http://localhost/api/admin/classifications",{
  method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
}));
const classification={kind:"MAJOR",source:"食品",parentName:""};
const locationId="loc-1";
beforeEach(()=>{
  vi.resetAllMocks();authState.admin=true;
  db.$transaction.mockImplementation(async callback=>callback(db));
  db.classification.findUnique.mockResolvedValue({id:"cat-1"});
  db.classification.count.mockResolvedValue(0);
  db.item.count.mockResolvedValue(0);
  db.item.findMany.mockResolvedValue([]);
  db.item.updateMany.mockResolvedValue({count:1});
  db.inventoryInstance.count.mockResolvedValue(0);
  db.itemRegistrationRequest.count.mockResolvedValue(0);
  db.stocktakeSession.count.mockResolvedValue(0);
  db.storageLocation.findUnique.mockImplementation(async ({where}:{where:{id:string}})=>where.id===locationId
    ? {id:locationId,name:"旧倉庫"}:{id:"loc-2",name:"新倉庫"});
  db.inventoryInstance.updateMany.mockResolvedValue({count:2});
  db.itemRegistrationRequest.updateMany.mockResolvedValue({count:1});
  db.stocktakeSession.updateMany.mockResolvedValue({count:1});
  db.classification.delete.mockResolvedValue({id:"cat-1"});
  db.classification.upsert.mockResolvedValue({id:"cat-1"});
  db.storageLocation.delete.mockResolvedValue({id:locationId});
  db.adminActionLog.create.mockResolvedValue({});
});
describe("safe classification / location retirement",()=>{
  it("does not allow non-admins to preview or delete",async()=>{
    authState.admin=false;
    expect((await post({action:"PREVIEW_DELETE_CLASSIFICATION",...classification})).status).toBe(403);
    expect((await post({action:"DELETE_LOCATION",sourceId:locationId})).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("previews an unused classification without mutating anything",async()=>{
    const response=await post({action:"PREVIEW_DELETE_CLASSIFICATION",...classification});
    expect(response.status).toBe(200);
    expect((await response.json()).assessment).toMatchObject({
      id:"cat-1",canDelete:true,
      counts:{items:0,stocks:0,registrationRequests:0,activeStocktakes:0,childCategories:0},
    });
    expect(db.classification.delete).not.toHaveBeenCalled();
    expect(db.adminActionLog.create).not.toHaveBeenCalled();
  });
  it.each([
    ["an item",()=>db.item.count.mockResolvedValue(1)],
    ["a lot-level override",()=>db.inventoryInstance.count.mockResolvedValue(2)],
    ["a pending registration",()=>db.itemRegistrationRequest.count.mockResolvedValue(3)],
    ["an active stocktake",()=>db.stocktakeSession.count.mockResolvedValue(1)],
    ["a child category",()=>db.classification.count.mockResolvedValue(1)],
  ] as const)("blocks deletion if referenced by %s",async(_,prepare)=>{
    prepare();
    const response=await post({action:"DELETE_CLASSIFICATION",...classification,
      expectedId:"cat-1",confirmName:"食品",reason:"不要な分類を整理"});
    expect(response.status).toBe(409);
    expect((await response.json()).assessment.canDelete).toBe(false);
    expect(db.classification.delete).not.toHaveBeenCalled();
    expect(db.adminActionLog.create).not.toHaveBeenCalled();
  });
  it("requires confirmation and checks the master identity",async()=>{
    expect((await post({action:"DELETE_CLASSIFICATION",...classification})).status).toBe(400);
    expect((await post({action:"DELETE_CLASSIFICATION",...classification,
      expectedId:"wrong",confirmName:"食品",reason:"不要な分類を整理"})).status).toBe(409);
    expect(db.classification.delete).not.toHaveBeenCalled();
  });
  it("deletes only an unreferenced classification and writes a transactional audit log",async()=>{
    const response=await post({action:"DELETE_CLASSIFICATION",...classification,
      expectedId:"cat-1",confirmName:"食品",reason:"不要な分類を整理"});
    expect(response.status).toBe(200);
    expect(db.classification.delete).toHaveBeenCalledWith({where:{id:"cat-1"}});
    expect(db.item.count).toHaveBeenCalled();
    expect(db.inventoryInstance.count).toHaveBeenCalled();
    expect(db.adminActionLog.create.mock.calls[0][0].data).toMatchObject({
      adminUserId:"admin",action:"CLASSIFICATION_DELETE_CLASSIFICATION",
      detail:{reason:"不要な分類を整理"},
    });
  });
  it("explains that 11 zero-stock products are product references rather than 11 inventory units",async()=>{
    const now=new Date("2026-11-22T01:00:00.000Z");
    db.item.count.mockImplementation(async ({where}:{where:{isArchived?:boolean}})=>where.isArchived?0:11);
    db.item.findMany.mockResolvedValue(Array.from({length:11},(_,i)=>({
      id:"item-"+i,name:"商品"+i,majorCategory:"食品",minorCategory:"菓子",updatedAt:now,
    })));
    const response=await post({action:"PREVIEW_DELETE_CLASSIFICATION",...classification});
    expect(response.status).toBe(200);
    const data=await response.json();
    expect(data.assessment.canDelete).toBe(false);
    expect(data.assessment.canUnassignAndDelete).toBe(true);
    expect(data.assessment.counts).toMatchObject({items:11,positiveStockRows:0,archivedItems:0});
    expect(data.assessment.linkedItems).toHaveLength(11);
    expect(db.item.updateMany).not.toHaveBeenCalled();
  });
  it("unassigns the categories of 11 zero-stock products and deletes only the classification master",async()=>{
    const now=new Date("2026-11-22T01:00:00.000Z");
    const items=Array.from({length:11},(_,i)=>({
      id:"item-"+i,name:"商品"+i,majorCategory:"食品",minorCategory:"菓子",updatedAt:now,
    }));
    db.item.count.mockImplementation(async ({where}:{where:{isArchived?:boolean}})=>where.isArchived?0:11);
    db.item.findMany.mockResolvedValue(items);
    const response=await post({action:"UNASSIGN_AND_DELETE_CLASSIFICATION",...classification,
      expectedId:"cat-1",confirmName:"食品",reason:"在庫がなくなったので分類を整理",
      expectedItems:items.map(item=>({id:item.id,updatedAt:item.updatedAt.toISOString()})),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).result.updatedProducts).toBe(11);
    expect(db.item.updateMany).toHaveBeenCalledTimes(11);
    expect(db.item.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data:{majorCategory:null,minorCategory:null},
    }));
    expect(db.classification.delete).toHaveBeenCalledWith({where:{id:"cat-1"}});
    expect(db.adminActionLog.create.mock.calls[0][0].data).toMatchObject({
      action:"CLASSIFICATION_UNASSIGN_AND_DELETE",
      detail:{updatedProducts:11,quantitiesPreserved:true,stocktakeHistoryPreserved:true},
    });
    expect(db.inventoryInstance.delete).not.toHaveBeenCalled();
    expect(db.stocktakeTarget.deleteMany).not.toHaveBeenCalled();
    expect(db.stocktakeRecord.deleteMany).not.toHaveBeenCalled();
  });
  it("blocks unassignment when any impacted current stock has positive quantity",async()=>{
    const now=new Date("2026-11-22T01:00:00.000Z");
    const item={id:"item-1",name:"商品",majorCategory:"食品",minorCategory:null,updatedAt:now};
    db.item.count.mockImplementation(async ({where}:{where:{isArchived?:boolean}})=>where.isArchived?0:1);
    db.item.findMany.mockResolvedValue([item]);
    db.inventoryInstance.count.mockImplementation(async ({where}:{where:{quantity?:{gt?:number}}})=>where.quantity?.gt===0?1:0);
    const response=await post({action:"UNASSIGN_AND_DELETE_CLASSIFICATION",...classification,
      expectedId:"cat-1",confirmName:"食品",reason:"分類を整理",
      expectedItems:[{id:item.id,updatedAt:now.toISOString()}],
    });
    expect(response.status).toBe(409);
    expect((await response.json()).assessment.counts.positiveStockRows).toBe(1);
    expect(db.item.updateMany).not.toHaveBeenCalled();
    expect(db.classification.delete).not.toHaveBeenCalled();
  });
  it("blocks changes made to a product after preview",async()=>{
    const now=new Date("2026-11-22T01:00:00.000Z");
    const item={id:"item-1",name:"商品",majorCategory:"食品",minorCategory:null,updatedAt:now};
    db.item.count.mockImplementation(async ({where}:{where:{isArchived?:boolean}})=>where.isArchived?0:1);
    db.item.findMany.mockResolvedValue([item]);
    const response=await post({action:"UNASSIGN_AND_DELETE_CLASSIFICATION",...classification,
      expectedId:"cat-1",confirmName:"食品",reason:"分類を整理",
      expectedItems:[{id:"item-1",updatedAt:"2026-11-21T01:00:00.000Z"}],
    });
    expect(response.status).toBe(409);
    expect(db.item.updateMany).not.toHaveBeenCalled();
  });
  it("never deletes a location linked by even archived stocks or registration requests",async()=>{
    db.inventoryInstance.count.mockResolvedValue(1);
    const response=await post({action:"DELETE_LOCATION",sourceId:locationId,
      expectedId:locationId,confirmName:"旧倉庫",reason:"廃止"});
    expect(response.status).toBe(409);
    expect(db.storageLocation.delete).not.toHaveBeenCalled();
  });
  it("removes an unused location after checking its displayed name",async()=>{
    expect((await post({action:"DELETE_LOCATION",sourceId:locationId,
      expectedId:locationId,confirmName:"間違った名前",reason:"廃止"})).status).toBe(409);
    const response=await post({action:"DELETE_LOCATION",sourceId:locationId,
      expectedId:locationId,confirmName:"旧倉庫",reason:"廃止"});
    expect(response.status).toBe(200);
    expect(db.storageLocation.delete).toHaveBeenCalledWith({where:{id:locationId}});
    expect(db.adminActionLog.create).toHaveBeenCalled();
  });
  it("prevents retirement when finished registration requests still reference the old location",async()=>{
    db.itemRegistrationRequest.count.mockResolvedValue(1);
    const response=await post({action:"MERGE_LOCATION",sourceId:locationId,targetId:"loc-2",reason:"旧倉庫を廃止"});
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("LOCATION_HISTORICAL_REQUESTS");
    expect(db.inventoryInstance.updateMany).not.toHaveBeenCalled();
    expect(db.storageLocation.delete).not.toHaveBeenCalled();
  });
  it("requires an explicit reason before retiring a used location",async()=>{
    expect((await post({action:"MERGE_LOCATION",sourceId:locationId,targetId:"loc-2"})).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("retires a location through reassignment without merging stocktake or deleting individual lots",async()=>{
    const response=await post({action:"MERGE_LOCATION",sourceId:locationId,targetId:"loc-2",reason:"旧倉庫を廃止"});
    expect(response.status).toBe(200);
    expect(db.inventoryInstance.updateMany).toHaveBeenCalledWith({
      where:{storageLocationId:locationId},data:{storageLocationId:"loc-2"},
    });
    expect(db.itemRegistrationRequest.updateMany).toHaveBeenCalled();
    expect(db.stocktakeSession.updateMany).toHaveBeenCalled();
    expect(db.inventoryInstance.delete).not.toHaveBeenCalled();
    expect(db.stocktakeRecord.deleteMany).not.toHaveBeenCalled();
    expect(db.stocktakeTarget.deleteMany).not.toHaveBeenCalled();
    expect(db.storageLocation.delete).toHaveBeenCalledWith({where:{id:locationId}});
    expect(db.adminActionLog.create.mock.calls[0][0].data.detail).toMatchObject({
      sourceLocationName:"旧倉庫",targetLocationName:"新倉庫",
      preservedInventoryInstances:true,moved:2,
    });
  });
});
