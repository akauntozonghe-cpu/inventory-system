import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {requireAdmin,getAdminElevation} from "@/lib/auth";
const labels={DELETE:"削除",EXCLUDE_INSPECTION:"棚卸・点検対象外に設定",INCLUDE_INSPECTION:"棚卸・点検対象に復帰"} as const;
export async function POST(request:NextRequest){
 const auth=requireAdmin(request);if(auth.response||!auth.user)return auth.response;
 const input=await request.json().catch(()=>null);
 const action=input?.operation as keyof typeof labels;
 const ids:string[]=Array.isArray(input?.itemIds)?[...new Set<string>(input.itemIds.filter((id:unknown)=>typeof id==="string"&&id.trim()))]:[];
 const reason=typeof input?.reason==="string"?input.reason.trim():"";
 if(!Object.hasOwn(labels,action)||!ids.length||ids.length>1000||reason.length<2||reason.length>500)return NextResponse.json({code:"ITEM_BULK_INPUT_INVALID",message:"対象商品と操作、2～500文字の理由を指定してください。"},{status:400});
 try{
  const count=await prisma.$transaction(async tx=>{
   const items=await tx.item.findMany({where:{id:{in:ids}},select:{id:true,name:true,isArchived:true,inspectionExcluded:true,inspectionExclusionReason:true}});
   if(items.length!==ids.length)throw new Error("ITEMS_CHANGED");
   if(action==="DELETE"){
    const stocks=await tx.inventoryInstance.findMany({
     where:{itemId:{in:ids}},
     select:{id:true,itemId:true,updatedAt:true,histories:{select:{action:true}},_count:{select:{stocktakeRecords:true,stocktakeTargets:true,inventoryEvents:true,marketplaceListings:true}}},
    });
    const protectedStocks=stocks.filter(stock=>stock._count.stocktakeRecords>0||stock._count.stocktakeTargets>0||stock._count.inventoryEvents>0||stock._count.marketplaceListings>0||stock.histories.some(history=>history.action!=="初回在庫登録"));
    if(protectedStocks.length)throw new Error("DELETE_PROTECTED");
    const stockIds=stocks.map(stock=>stock.id);
    if(stockIds.length){
     await tx.inventoryHistory.deleteMany({where:{inventoryInstanceId:{in:stockIds},action:"初回在庫登録"}});
     const removed=await tx.inventoryInstance.deleteMany({where:{id:{in:stockIds}}});
     if(removed.count!==stockIds.length)throw new Error("ITEMS_CHANGED");
    }
    const actor=(auth.user!.baseRole??auth.user!.role)==="ADMIN"?auth.user!.id:getAdminElevation(request)?.adminUserId;
    if(!actor)throw new Error("ADMIN_REQUIRED");
    const removed=await tx.item.deleteMany({where:{id:{in:ids}}});
    if(removed.count!==ids.length)throw new Error("ITEMS_CHANGED");
    await tx.adminActionLog.create({data:{adminUserId:actor,action:"ITEM_BULK_DELETE",route:"/items",detail:{reason,items,stockIds,requestedBy:auth.user!.id}}});
    return removed.count;
   }
   const data=action==="EXCLUDE_INSPECTION"?{inspectionExcluded:true,inspectionExclusionReason:reason}:{inspectionExcluded:false,inspectionExclusionReason:null};
   if(action==="EXCLUDE_INSPECTION"||action==="INCLUDE_INSPECTION")await tx.inventoryInstance.updateMany({where:{itemId:{in:ids}},data:{inspectionExcluded:action==="EXCLUDE_INSPECTION",inspectionExclusionReason:action==="EXCLUDE_INSPECTION"?reason:null}});
   const updated=await tx.item.updateMany({where:{id:{in:ids}},data});
   const actor=(auth.user!.baseRole??auth.user!.role)==="ADMIN"?auth.user!.id:getAdminElevation(request)?.adminUserId;
   if(!actor)throw new Error("ADMIN_REQUIRED");
   await tx.adminActionLog.create({data:{adminUserId:actor,action:"ITEM_BULK_"+action,route:"/items",detail:{reason,before:items,after:data,requestedBy:auth.user!.id}}});
   return updated.count;
  },{isolationLevel:"Serializable",timeout:30000});
  return NextResponse.json({success:true,code:"ITEM_BULK_"+action+"_OK",message:`${count}件の商品を${labels[action]}しました。`,summary:{affectedCount:count}});
 }catch(error){
  if(error instanceof Error&&error.message==="DELETE_PROTECTED")return NextResponse.json({code:"DELETE_PROTECTED",message:"棚卸・取引・出品などの記録がある在庫を含むため、一括削除は実行しませんでした。履歴を残す場合は「対象から外す」を使ってください。"},{status:409});
  return NextResponse.json({code:"ITEM_BULK_FAILED",message:"一括変更を保存できませんでした。最新情報を読み直して再確認してください。"},{status:409});
 }
}
