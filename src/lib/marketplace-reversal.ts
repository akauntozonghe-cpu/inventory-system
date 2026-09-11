import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminElevation, requireAdmin } from "@/lib/auth";

/** A reversal adds a compensating entry; original sale events remain auditable. */
export async function reverseMarketplace(request: NextRequest, body: Record<string, unknown>) {
  const auth = requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;
  const elevation = getAdminElevation(request);
  if (auth.user.role !== "ADMIN" && (!elevation || elevation.authenticatedByUserId !== auth.user.id)) return NextResponse.json({code:"ADMIN_ELEVATION_REQUIRED",message:"取消・差戻しには管理者認証が必要です。"},{status:403});
  const id = typeof body.id === "string" ? body.id : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0,1000) : "";
  const target = body.targetStatus;
  if (!reason || !id || !["DRAFT","CANCELLED"].includes(String(target)) || typeof body.expectedUpdatedAt !== "string" || Number.isNaN(Date.parse(body.expectedUpdatedAt))) return NextResponse.json({message:"対象・戻し先・理由を確認してください。"},{status:400});
  const result = await prisma.$transaction(async tx => {
    const current = await tx.marketplaceListing.findUnique({where:{id},include:{inventoryInstance:true}});
    if (!current || current.updatedAt.toISOString() !== body.expectedUpdatedAt || current.status === target) throw new Error("MARKETPLACE_CHANGED");
    if (current.status === "SOLD" && body.stockConfirmed !== true) return null;
    const restored = current.status === "SOLD" ? current.soldQuantity : 0;
    const inventory = current.inventoryInstance;
    const after = inventory.quantity + restored;
    if (after > 2147483647 || (inventory.actualQuantity !== null && inventory.actualQuantity + restored > 2147483647) || restored < 0 || (current.status === "SOLD" && restored === 0)) throw new Error("MARKETPLACE_CHANGED");
    if (target === "DRAFT") {
      const reserved = await tx.marketplaceListing.aggregate({where:{inventoryInstanceId:inventory.id,id:{not:id},status:{in:["DRAFT","READY","LISTED"]}},_sum:{listedQuantity:true}});
      if (after - (reserved._sum.listedQuantity ?? 0) < current.listedQuantity) throw new Error("MARKETPLACE_STOCK_SHORTAGE");
    }
    const claimed = await tx.marketplaceListing.updateMany({where:{id,status:current.status,updatedAt:current.updatedAt},data:{status:target as "DRAFT"|"CANCELLED",soldQuantity:0,soldAt:null,shippingDueAt:null,listedAt:null,shippingStatus:"NOT_READY",shippedAt:null,deliveredAt:null,settledAt:null,trackingNumber:null}});
    if (claimed.count !== 1) throw new Error("MARKETPLACE_CHANGED");
    if (restored) {
      const changed = await tx.inventoryInstance.updateMany({where:{id:inventory.id,updatedAt:inventory.updatedAt,quantity:inventory.quantity},data:{quantity:after,actualQuantity:inventory.actualQuantity === null ? null : inventory.actualQuantity + restored}});
      if (changed.count !== 1) throw new Error("MARKETPLACE_CHANGED");
      await tx.inventoryHistory.create({data:{inventoryInstanceId:inventory.id,changeQuantity:restored,action:"フリマ販売取消："+reason}});
      await tx.inventoryEvent.create({data:{inventoryInstanceId:inventory.id,eventType:"RETURN",quantityBefore:inventory.quantity,quantityChange:restored,quantityAfter:after,reason,performedByUserId:auth.user!.id,detail:{marketplaceListingId:id,adminUserId:(elevation?.adminUserId ?? auth.user.id),originalStatus:current.status}}});
    }
    const active = await tx.marketplaceListing.count({where:{inventoryInstanceId:inventory.id,status:{in:["DRAFT","READY","LISTED"]}}});
    await tx.inventoryInstance.update({where:{id:inventory.id},data:{allocationType:active ? "flea_market":"home"}});
    await tx.adminActionLog.create({data:{adminUserId:(elevation?.adminUserId ?? auth.user.id),action:"MARKETPLACE_ADMIN_REVERSE",route:"/marketplace",detail:{listingId:id,operatorUserId:auth.user!.id,reason,from:current.status,to:String(target),restoredQuantity:restored,inventoryBefore:inventory.quantity,inventoryAfter:after,originalSale:{price:current.price,soldQuantity:current.soldQuantity,fee:current.fee,shippingCost:current.shippingCost,packagingCost:current.packagingCost,acquisitionCostSnapshot:current.acquisitionCostSnapshot,shippingStatus:current.shippingStatus,trackingNumber:current.trackingNumber,soldAt:current.soldAt?.toISOString()??null}}}});
    return {restored};
  },{isolationLevel:"Serializable"});
  if (!result) return NextResponse.json({message:"販売分が未発送または返却済みで、在庫に戻せることを確認してください。"},{status:400});
  return NextResponse.json({message:`${target === "DRAFT" ? "出品準備に差し戻しました" : "取り消しました"}。在庫へ${result.restored}点戻しました。外部サイトの取引・返金は別途確認してください。`});
}
