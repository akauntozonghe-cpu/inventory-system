import {NextRequest,NextResponse} from "next/server";
import {requireLogin,requireAdmin,hasAdminAccess,getAdminElevation} from "@/lib/auth";
import {CAMERA_EXEMPTION_COOKIE,CAMERA_EXEMPTION_SECONDS,createCameraExemption,hasCameraExemption} from "@/lib/camera-exemption";
import {prisma} from "@/lib/prisma";
export async function GET(request:NextRequest){
  const auth=requireLogin(request);if(auth.response||!auth.user)return auth.response;
  const user=await prisma.appUser.findUnique({where:{id:auth.user.id},select:{featurePermissions:true}});
  return NextResponse.json({cameraRequired:!user?.featurePermissions.includes("CAMERA_OPTIONAL" as never)&&!hasCameraExemption(request.cookies.get(CAMERA_EXEMPTION_COOKIE)?.value),canManage:hasAdminAccess(request),sessionKey:auth.user.id+":"+auth.user.expiresAt},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:NextRequest){
  const auth=requireAdmin(request);if(auth.response||!auth.user)return auth.response;
  const body=await request.json().catch(()=>null);
  if(typeof body?.cameraRequired!=="boolean")return NextResponse.json({code:"PERMISSION_INPUT_INVALID",message:"カメラの必須設定を確認してください。"},{status:400});
  try{
    const adminUserId=auth.user.role==="ADMIN"?auth.user.id:getAdminElevation(request)?.adminUserId;
    if(!adminUserId)return NextResponse.json({code:"ADMIN_REQUIRED",message:"管理者認証をやり直してください。"},{status:403});
    const token=body.cameraRequired?"":createCameraExemption(adminUserId);
    await prisma.adminActionLog.create({data:{adminUserId,action:"DEVICE_CAMERA_REQUIREMENT",route:"/notifications",detail:{cameraRequired:body.cameraRequired,scope:"CURRENT_BROWSER",requestedBy:auth.user.id}}});
    const response=NextResponse.json({cameraRequired:body.cameraRequired,message:body.cameraRequired?"この端末のカメラを必須に戻しました。":"管理者がこの端末のカメラ必須を解除しました。検索・手入力で作業できます。"});
    response.cookies.set(CAMERA_EXEMPTION_COOKIE,token,{httpOnly:true,secure:request.nextUrl.protocol==="https:",sameSite:"lax",path:"/",maxAge:body.cameraRequired?0:CAMERA_EXEMPTION_SECONDS});
    return response;
  }catch{return NextResponse.json({code:"PERMISSION_SAVE_FAILED",message:"設定を保存できませんでした。もう一度お試しください。"},{status:503});}
}
