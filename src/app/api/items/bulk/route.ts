import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {requireAdmin,getAdminElevation} from "@/lib/auth";
const labels={ARCHIVE:"廃止",RESTORE:"復帰",EXCLUDE_INSPECTION:"点検対象外に設定",INCLUDE_INSPECTION:"点検対象に復帰"} as const;
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
   if(action==="ARCHIVE"){
    const [listings,targets]=await Promise.all([
     tx.marketplaceListing.count({where:{inventoryInstance:{itemId:{in:ids}},status:{in:["DRAFT","READY","LISTED"]}}}),
     tx.stocktakeTarget.count({where:{inventoryInstance:{itemId:{in:ids}},session:{status:{in:["IN_PROGRESS","PAUSED","REVIEW","CONFLICT"]}}}}),
    ]);
    if(listings||targets)throw new Error("ITEM_ACTIVE_WORK");
   }
   const data=action==="ARCHIVE"?{isArchived:true,archivedAt:new Date(),archiveReason:reason}:action==="RESTORE"?{isArchived:false,archivedAt:null,archiveReason:null}:action==="EXCLUDE_INSPECTION"?{inspectionExcluded:true,inspectionExclusionReason:reason}:{inspectionExcluded:false,inspectionExclusionReason:null};
   const updated=await tx.item.updateMany({where:{id:{in:ids}},data});
   const actor=auth.user!.role==="ADMIN"?auth.user!.id:getAdminElevation(request)?.adminUserId;
   if(!actor)throw new Error("ADMIN_REQUIRED");
   await tx.adminActionLog.create({data:{adminUserId:actor,action:"ITEM_BULK_"+action,route:"/items",detail:{reason,before:items,after:data,requestedBy:auth.user!.id}}});
   return updated.count;
  },{isolationLevel:"Serializable",timeout:30000});
  return NextResponse.json({success:true,code:"ITEM_BULK_"+action+"_OK",message:`${count}件の商品を${labels[action]}しました。`,summary:{affectedCount:count}});
 }catch(error){
  if(error instanceof Error&&error.message==="ITEM_ACTIVE_WORK")return NextResponse.json({code:"ITEM_ACTIVE_WORK",message:"対象商品に進行中の棚卸、またはフリマの準備・出品があります。先に作業を完了・取消ししてから廃止してください。点検だけ外す場合は「点検対象外」を使えます。"},{status:409});
  return NextResponse.json({code:"ITEM_BULK_FAILED",message:"一括変更を保存できませんでした。最新情報を読み直して再確認してください。"},{status:409});
 }
}
