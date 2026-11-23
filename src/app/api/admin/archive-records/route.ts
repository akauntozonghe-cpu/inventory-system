import {NextRequest,NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {requireAdmin} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
export const dynamic="force-dynamic";
const types=["CLASSIFICATION","STORAGE_LOCATION"] as const;
function nameOf(value:unknown):string{
  return typeof value==="string" ? value.normalize("NFKC").trim().slice(0,100) : "";
}
function snapshotRecord(value:unknown):Record<string,unknown>|null{
  if(!value || typeof value!=="object" || Array.isArray(value))return null;
  return value as Record<string,unknown>;
}
/** No active entity data appears here. This is a restricted, historical record interface. */
export async function GET(request:NextRequest){
  const auth=requireAdmin(request);if(auth.response || !auth.user)return auth.response;
  const type=request.nextUrl.searchParams.get("type");
  if(type && !types.includes(type as typeof types[number]))
    return NextResponse.json({code:"ARCHIVE_TYPE_INVALID"},{status:400});
  const take=Math.min(100,Math.max(1,Number(request.nextUrl.searchParams.get("limit"))||30));
  const records=await prisma.archiveRecord.findMany({
    where:type?{entityType:type}: {entityType:{in:[...types]}},
    select:{id:true,entityType:true,originalId:true,snapshot:true,snapshotVersion:true,
      archivedAt:true,archivedByUserId:true,reason:true,
      reRegistrations:{select:{id:true,newEntityType:true,newEntityId:true,createdAt:true}}},
    orderBy:[{archivedAt:"desc"},{id:"desc"}],take,
  });
  return NextResponse.json({records},{headers:{"Cache-Control":"private,no-store"}});
}
/** Re-registration is CREATE of a NEW active ID, not flag-based restoration. */
export async function POST(request:NextRequest){
  const auth=requireAdmin(request);if(auth.response || !auth.user)return auth.response;
  const body=await request.json().catch(()=>null);
  const archiveId=typeof body?.archiveId==="string"?body.archiveId:"";
  if(!archiveId || archiveId.length>150 || body?.confirmation!=="REGISTER_AS_NEW")
    return NextResponse.json({code:"ARCHIVE_REGISTER_CONFIRM_REQUIRED",message:"廃止記録を選択し、新規登録として確認してください。"},{status:400});
  try{
    const result=await prisma.$transaction(async tx=>{
      const archive=await tx.archiveRecord.findUnique({where:{id:archiveId}});
      if(!archive || !types.includes(archive.entityType as typeof types[number]))
        throw new Error("ARCHIVE_NOT_FOUND");
      const old=snapshotRecord(archive.snapshot);
      if(!old)throw new Error("ARCHIVE_SNAPSHOT_INVALID");
      const name=nameOf(body.name) || nameOf(old.name);
      if(!name)throw new Error("ARCHIVE_NAME_REQUIRED");
      const normalization=(v:string)=>v.normalize("NFKC").trim().toLocaleLowerCase("ja");
      let newId:string;
      if(archive.entityType==="CLASSIFICATION"){
        const kind=old.kind;
        if(kind!=="MAJOR" && kind!=="MINOR")throw new Error("ARCHIVE_KIND_INVALID");
        const parentName=kind==="MAJOR"?"":nameOf(body.parentName)||nameOf(old.parentName);
        if(kind==="MINOR"){
          if(!parentName)throw new Error("ARCHIVE_PARENT_REQUIRED");
          const parent=await tx.classification.findUnique({where:{kind_name_parentName:{kind:"MAJOR",name:parentName,parentName:""}}});
          if(!parent || parent.retiredAt)throw new Error("ARCHIVE_PARENT_REQUIRED");
        }
        const existing=await tx.classification.findMany({where:{kind,parentName},select:{name:true}});
        if(existing.some(row=>normalization(row.name)===normalization(name)))
          throw new Error("ARCHIVE_DUPLICATE_ACTIVE");
        const created=await tx.classification.create({data:{kind,name,parentName}});
        newId=created.id;
      }else{
        const locations=await tx.storageLocation.findMany({select:{name:true}});
        if(locations.some(row=>normalization(row.name)===normalization(name)))
          throw new Error("ARCHIVE_DUPLICATE_ACTIVE");
        const created=await tx.storageLocation.create({data:{
          name,description:typeof body.description==="string"?body.description.slice(0,500)
            :typeof old.description==="string"?old.description.slice(0,500):null,
        }});
        newId=created.id;
      }
      await tx.archiveReRegistration.create({data:{
        archiveId:archive.id,newEntityType:archive.entityType,newEntityId:newId,performedById:auth.user!.id,
      }});
      await tx.adminActionLog.create({data:{
        adminUserId:auth.user!.id,action:"ARCHIVE_REGISTER_AS_NEW",route:"/api/admin/archive-records",
        detail:{archiveId,originalId:archive.originalId,entityType:archive.entityType,newId},
      }});
      return {newId,entityType:archive.entityType,archiveId};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json({code:"ARCHIVE_REGISTERED",result},{status:201});
  }catch(error){
    const code=error instanceof Error?error.message:"ARCHIVE_REGISTER_FAILED";
    const messages:Record<string,string>={
      ARCHIVE_NOT_FOUND:"廃止記録が見つかりません。",
      ARCHIVE_SNAPSHOT_INVALID:"記録データが不完全です。",
      ARCHIVE_NAME_REQUIRED:"登録する名前を入力してください。",
      ARCHIVE_KIND_INVALID:"この分類記録は再登録できません。",
      ARCHIVE_PARENT_REQUIRED:"小分類の有効な親分類を選択してください。",
      ARCHIVE_DUPLICATE_ACTIVE:"現役領域に同じ名前の項目があります。既存の項目を使用してください。",
    };
    return NextResponse.json({code:messages[code]?code:"ARCHIVE_REGISTER_FAILED",message:messages[code]||"再登録に失敗しました。既存の登録状態を確認してください。"},{status:409});
  }
}
