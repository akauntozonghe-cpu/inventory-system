import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireLogin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_PHOTOS, MAX_PHOTO_BYTES, prepareItemPhoto } from "@/lib/item-photo";
type Params={params:Promise<{id:string}>};
export async function GET(request:NextRequest,{params}:Params){
  const auth=requireLogin(request);if(auth.response)return auth.response;
  const {id}=await params;
  const photos=await prisma.itemPhoto.findMany({where:{itemId:id},select:{id:true,createdAt:true},orderBy:[{createdAt:"asc"},{id:"asc"}]});
  return NextResponse.json({photos},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:NextRequest,{params}:Params){
  const auth=requireAdmin(request);if(auth.response)return auth.response;
  const {id}=await params;
  if(Number(request.headers.get("content-length"))>MAX_PHOTO_BYTES)return NextResponse.json({message:"写真は4MB以内にしてください。"},{status:413});
  const reader=request.body?.getReader();if(!reader)return NextResponse.json({message:"写真を選んでください。"},{status:400});
  let photo:Awaited<ReturnType<typeof prepareItemPhoto>>;
  try {
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_PHOTO_BYTES){await reader.cancel();return NextResponse.json({message:"写真は4MB以内にしてください。"},{status:413});}chunks.push(part.value);}
    photo=await prepareItemPhoto(Buffer.concat(chunks));
  }catch{return NextResponse.json({message:"写真を読み取れませんでした。JPEG・PNG・WebPの画像を選んでください。"},{status:400});}
  try{
    const result=await prisma.$transaction(async tx=>{
      const items=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "Item" WHERE "id" = ${id} FOR UPDATE`;
      if(!items.length)throw new Error("NOT_FOUND");
      if(await tx.itemPhoto.count({where:{itemId:id}})>=MAX_PHOTOS)throw new Error("PHOTO_LIMIT");
      const saved=await tx.itemPhoto.create({data:{itemId:id,...photo},select:{id:true,createdAt:true}});
      await tx.adminActionLog.create({data:{adminUserId:auth.user!.id,action:"ITEM_PHOTO_ADD",route:"/api/items/"+id+"/photos",detail:{itemId:id,photoId:saved.id}}});
      return saved;
    });
    return NextResponse.json({photo:result},{status:201});
  }catch(error){const message=error instanceof Error?error.message:"";return NextResponse.json({message:message==="PHOTO_LIMIT"?"写真は1商品につき5枚までです。":message==="NOT_FOUND"?"商品が見つかりません。":"写真を保存できませんでした。"},{status:message==="PHOTO_LIMIT"?409:message==="NOT_FOUND"?404:503});}
}
