import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db=vi.hoisted(()=>({inventoryInstance:{findUnique:vi.fn()},salesChannelSetting:{findUnique:vi.fn()},salesRecommendationSetting:{findUnique:vi.fn()},shippingRate:{findMany:vi.fn()},marketplaceListing:{findMany:vi.fn()}}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
vi.mock("@/lib/auth",()=>({requireLogin:()=>({user:{id:"worker"}})}));
import { POST } from "../src/app/api/admin/marketplace/proposal/route";
const inventory={id:"lot1",itemId:"product1",quantity:4,status:"在庫",item:{name:"商品",isArchived:false},marketplaceListings:[{listedQuantity:1}],acquisitionCost:100,packageWeightGrams:500,packageLengthCm:24,packageWidthCm:15,packageHeightCm:2};
beforeEach(()=>{vi.clearAllMocks();db.inventoryInstance.findUnique.mockResolvedValue(inventory);db.salesChannelSetting.findUnique.mockResolvedValue({feeRateBps:1000});db.salesRecommendationSetting.findUnique.mockResolvedValue({targetProfitRateBps:2000});db.shippingRate.findMany.mockResolvedValue([]);db.marketplaceListing.findMany.mockResolvedValue([{price:1000}]);});
const request=(extra:object={})=>POST(new NextRequest("http://localhost/api/admin/marketplace/proposal",{method:"POST",body:JSON.stringify({inventoryInstanceId:"lot1",quantity:1,condition:"新品、未使用",channel:"mercari",packagingCost:30,...extra})}));
it("uses only matching product, condition and channel history and returns an internal decimal correlation id",async()=>{
 const response=await request();const data=await response!.json();expect(response?.status).toBe(200);expect(response?.headers.get("X-Operation-Id")).toMatch(/^\d+$/);
 expect(db.marketplaceListing.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({channel:"mercari",itemCondition:"新品、未使用",inventoryInstance:{itemId:"product1"}})}));
 expect(data.methods[0]).toMatchObject({fee:210,fit:"MATCH",numbers:{price:1000,profit:560,source:"HISTORY"}});
});
it("rejects unavailable stock instead of reserving or publishing anything",async()=>{
 expect((await request({quantity:4}))?.status).toBe(409);
 expect(db.marketplaceListing.findMany).not.toHaveBeenCalled();
});
it("does not apply single-item package dimensions to a multiple-item shipment",async()=>{
 const response=await request({quantity:2});const data=await response!.json();expect(data.parcel).toEqual({length:null,width:null,height:null,weight:null});expect(data.methods.every((row:{fit:string})=>row.fit==="UNKNOWN")).toBe(true);
});
it("keeps zero packaging distinct from missing packaging",async()=>{
 const response=await request({packagingCost:""});const data=await response!.json();expect(data.methods[0].numbers.profit).toBeNull();
 const zero=await request({packagingCost:0});expect((await zero!.json()).methods[0].numbers.profit).toBe(590);
});
it("rejects malformed dimensions and archived products",async()=>{
 expect((await request({weight:-1}))?.status).toBe(400);
 db.inventoryInstance.findUnique.mockResolvedValue({...inventory,item:{...inventory.item,isArchived:true}});expect((await request())?.status).toBe(404);
});
it("does not fetch a whole-category median when condition is unknown",async()=>{
 const response=await request({condition:""});expect(response?.status).toBe(200);expect(db.marketplaceListing.findMany).not.toHaveBeenCalled();expect((await response!.json()).methods[0].numbers.source).toBe("COST");
});
