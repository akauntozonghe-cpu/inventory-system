import {NextRequest,NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {prisma} from "@/lib/prisma";
import {requireAdmin} from "@/lib/auth";
import {assessClassificationCleanup,assessLocationCleanup} from "@/lib/classification-cleanup";
export const dynamic="force-dynamic";

/**
 * Explicit, one-record-at-a-time migration for legacy retired category/location masters.
 * No force mode. Historical inventory/stocktake/outstanding references ALWAYS block removal.
 * The snapshot and deletion are atomic. This cannot migrate items or inventory instances.
 */
export async function POST(request:NextRequest){
  const auth=requireAdmin(request);
  if(auth.response || !auth.user)return auth.response;
  const data=await request.json().catch(()=>null);
  const entityType=data?.entityType;
  const id=typeof data?.id==="string"?data.id:"";
  const mode=data?.mode;
  if(!["CLASSIFICATION","STORAGE_LOCATION"].includes(entityType) || !id || id.length>150 ||
     !["PREVIEW","MIGRATE"].includes(mode) || (mode==="MIGRATE"&&data?.confirmId!==id))
    return NextResponse.json({code:"ARCHIVE_MIGRATION_INPUT_INVALID",message:"対象と操作を指定し、記録IDを入力して確認してください。"},{status:400});
  try{
    const result=await prisma.$transaction(async tx=>{
      const master=entityType==="CLASSIFICATION"
        ?await tx.classification.findUnique({where:{id},include:{labelAliases:true}})
        :await tx.storageLocation.findUnique({where:{id}});
      if(!master)throw new Error("ARCHIVE_SOURCE_NOT_FOUND");
      if(!master.retiredAt)throw new Error("ARCHIVE_SOURCE_ACTIVE");
      let assessment;
      if(entityType==="CLASSIFICATION"){
        if(!("kind" in master) || !("parentName" in master))throw new Error("ARCHIVE_INVALID_KIND");
        const kind=master.kind;
        if(kind!=="MAJOR"&&kind!=="MINOR")throw new Error("ARCHIVE_INVALID_KIND");
        assessment=await assessClassificationCleanup(tx,kind,master.name,master.parentName);
      }else{
        assessment=await assessLocationCleanup(tx,id);
      }
      if(assessment.id!==id)throw new Error("ARCHIVE_SOURCE_CHANGED");
      if(!assessment.canDelete || mode==="PREVIEW")
        return {migrated:false,eligible:assessment.canDelete,assessment};
      // Snapshot ALL original metadata, including previous QR aliases.
      const snapshot=JSON.parse(JSON.stringify(master)) as Prisma.InputJsonValue;
      const created=await tx.archiveRecord.create({data:{
        entityType,originalId:id,snapshot,snapshotVersion:1,
        archivedAt:master.retiredAt,archivedByUserId:auth.user!.id,
        reason:master.retirementReason || "旧廃止データの移行",
      }});
      if(entityType==="CLASSIFICATION")
        await tx.classification.delete({where:{id}});
      else
        await tx.storageLocation.delete({where:{id}});
      await tx.adminActionLog.create({data:{
        adminUserId:auth.user!.id,action:"ARCHIVE_LEGACY_MASTER_MIGRATION",route:"/api/admin/archive-migrate",
        detail:{originalId:id,archiveRecordId:created.id,entityType},
      }});
      return {migrated:true,eligible:true,archiveRecordId:created.id};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    if(!result.eligible)
      return NextResponse.json({code:"ARCHIVE_REFERENCES_ACTIVE",message:"現役データや関連履歴の参照が残っています。移管先を整理してから再実行してください。",result},{status:409});
    return NextResponse.json({code:result.migrated?"ARCHIVE_MIGRATED":"ARCHIVE_MIGRATION_PREVIEW",result});
  }catch(error){
    const code=error instanceof Error?error.message:"";
    const message:Record<string,string>={
      ARCHIVE_SOURCE_NOT_FOUND:"対象が見つかりません。",
      ARCHIVE_SOURCE_ACTIVE:"現役データはこの移行操作では扱いません。",
      ARCHIVE_SOURCE_CHANGED:"データが更新されています。事前診断からやり直してください。",
      ARCHIVE_INVALID_KIND:"分類の種類が不正です。",
    };
    return NextResponse.json({code:message[code]?code:"ARCHIVE_MIGRATION_FAILED",
      message:message[code] || "移行できませんでした。既存データは変更せず、参照状態を再確認してください。"}, {status:409});
  }
}
