import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getAdminElevation } from "@/lib/auth";
export async function GET(request:NextRequest) {
 const auth=requireAdmin(request);if(auth.response)return auth.response;
 const route=request.nextUrl.searchParams.get("route");if(!route?.startsWith("/"))return NextResponse.json({message:"対象画面を指定してください。"},{status:400});
 try {const reports=await prisma.errorReport.findMany({where:{route,recoveryStatus:"ADMIN_REQUIRED"},orderBy:{occurredAt:"desc"},take:50,select:{id:true,code:true,message:true,recoveryAttempts:true,sessionId:true}});return NextResponse.json({reports});}
 catch{return NextResponse.json({code:"RECOVERY_REPORTS_FAILED",message:"復旧対象を取得できませんでした。"},{status:503});}
}
export async function PATCH(request:NextRequest) {
 const auth=requireAdmin(request);if(auth.response||!auth.user)return auth.response;
 const input=await request.json().catch(()=>null);
 if(!input||typeof input.id!=="string"||typeof input.runId!=="string"||typeof input.route!=="string"||typeof input.reason!=="string"||!input.reason.trim()||input.verified!==true||!Number.isInteger(input.expectedAttempts))return NextResponse.json({message:"再診断と動作確認、対応内容の入力が必要です。"},{status:400});
 try {
  const actor=getAdminElevation(request)?.adminUserId??auth.user.id;
  await prisma.$transaction(async tx=>{
   const run=await tx.systemCheckRun.findUnique({where:{id:input.runId},include:{items:true}});
   if(!run||run.contextRoute!==input.route||run.errorReportId!==input.id||run.mode!=="AUTO"||run.items.length===0||Date.now()-run.createdAt.getTime()>300000||run.items.some(item=>item.status==="FAIL"||item.status==="NOT_RUN"))throw new Error("RECHECK_REQUIRED");
   const changed=await tx.errorReport.updateMany({where:{id:input.id,route:input.route,recoveryStatus:"ADMIN_REQUIRED",recoveryAttempts:input.expectedAttempts},data:{status:"RESOLVED",recoveryStatus:"RECOVERED",resolvedAt:new Date(),recoveredAt:new Date(),recoveryNote:input.reason.trim().slice(0,1000)}});
   if(changed.count!==1)throw new Error("REPORT_CHANGED");
   await tx.adminActionLog.create({data:{adminUserId:actor,errorReportId:input.id,action:"PAGE_RECOVERY_CONFIRMED",route:input.route,detail:{runId:input.runId,reason:input.reason.trim().slice(0,1000),operatorUserId:auth.user!.id}}});
  },{isolationLevel:"Serializable"});
  return NextResponse.json({message:"復旧を記録しました。簡易保存は元の端末で同期されます。"});
 }catch{return NextResponse.json({code:"RECOVERY_RECHECK_REQUIRED",message:"最新の診断と動作確認を行い、復旧対象を読み直してください。"},{status:409});}
}
