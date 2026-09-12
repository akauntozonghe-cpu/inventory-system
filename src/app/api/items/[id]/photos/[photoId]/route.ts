import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireLogin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
type Params={params:Promise<{id:string;photoId:string}>};
export async function GET(request:NextRequest,{params}:Params){
  const auth=requireLogin(request);if(auth.response)return auth.response;
  const {id,photoId}=await params;
  const thumbnail=request.nextUrl.searchParams.get("thumbnail")==="1";
  const where={id:photoId,itemId:id};
  const bytes=thumbnail ? (await prisma.itemPhoto.findFirst({where,select:{thumbnail:true}}))?.thumbnail : (await prisma.itemPhoto.findFirst({where,select:{data:true}}))?.data;
  if(!bytes)return new NextResponse(null,{status:404});
  return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":"image/webp","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
export async function DELETE(request:NextRequest,{params}:Params){
  const auth=requireAdmin(request);if(auth.response)return auth.response;
  const {id,photoId}=await params;
  await prisma.$transaction(async tx=>{
    const deleted=await tx.itemPhoto.deleteMany({where:{id:photoId,itemId:id}});
    if(deleted.count)await tx.adminActionLog.create({data:{adminUserId:auth.user!.id,action:"ITEM_PHOTO_DELETE",route:"/api/items/"+id+"/photos",detail:{itemId:id,photoId}}});
  });
  return NextResponse.json({success:true});
}
