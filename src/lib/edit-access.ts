import { NextResponse, type NextRequest } from "next/server";
import { getLoggedInUser, getAdminElevation } from "./auth";
import { prisma } from "./prisma";
import type { EditFeature } from "./feature-permissions";
export async function requireEditAccess(request:NextRequest,feature:EditFeature){
  const user=getLoggedInUser(request);
  const denied=(status:number,message:string)=>({user:null,authorization:undefined,response:NextResponse.json({code:"EDIT_PERMISSION_REQUIRED",message},{status})});
  if(!user)return denied(401,"ログインが必要です。");
  const live=await prisma.appUser.findUnique({where:{id:user.id},select:{isActive:true,role:true,featurePermissions:true,displayName:true}});
  if(!live?.isActive)return denied(403,"このアカウントでは操作できません。");
  const actor={actorId:user.id,actorName:live.displayName};
  if(live.role==="ADMIN")return {user,response:null,authorization:{...actor,mode:"STANDARD_ADMIN"}};
  const elevation=getAdminElevation(request);
  if(elevation?.authenticatedByUserId===user.id){
    const sponsor=await prisma.appUser.findUnique({where:{id:elevation.adminUserId},select:{isActive:true,role:true,displayName:true}});
    if(sponsor?.isActive&&sponsor.role==="ADMIN")return {user,response:null,authorization:{...actor,mode:"TEMPORARY_ADMIN",authorizedById:elevation.adminUserId,authorizedByName:sponsor.displayName,expiresAt:elevation.expiresAt,usedForEdit:true}};
  }
  if(live.featurePermissions.includes(feature as never)&&live.featurePermissions.includes("CATALOG"))return {user,response:null,authorization:{...actor,mode:"ASSIGNED_PERMISSION",feature}};
  return denied(403,feature==="ITEM_EDIT"?"商品情報の編集権限がありません。管理者に権限の付与を依頼してください。":"在庫明細の編集権限がありません。管理者に権限の付与を依頼してください。");
}
