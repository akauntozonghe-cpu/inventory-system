import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Read-only, administrator-only diagnosis of why an existing stock entry
 * cannot be found in a particular stocktake. Never changes session targets,
 * inventory quantities, flags, or historical records.
 */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;

  const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim() ?? "";
  const q = request.nextUrl.searchParams.get("q")?.normalize("NFKC").trim() ?? "";
  if (!sessionId || q.length < 2 || q.length > 100) {
    return NextResponse.json({code:"DIAG_INPUT_INVALID",message:"棚卸と、2～100文字のJAN・商品名・在庫番号を指定してください。"},{status:400});
  }

  try {
    const session = await prisma.stocktakeSession.findUnique({
      where:{id:sessionId},
      select:{id:true,title:true,status:true,scopeType:true,scopeValue:true},
    });
    if (!session) return NextResponse.json({code:"SESSION_NOT_FOUND",message:"棚卸が見つかりません。"},{status:404});

    const entries = await prisma.inventoryInstance.findMany({
      where:{OR:[
        {id:q},
        {managementCode:q},
        {lotNo:{contains:q,mode:Prisma.QueryMode.insensitive}},
        {item:{is:{janCode:q}}},
        {item:{is:{systemBarcode:q}}},
        {item:{is:{name:{contains:q,mode:Prisma.QueryMode.insensitive}}}},
        {item:{is:{managementCode:q}}},
      ]},
      select:{
        id:true,lotNo:true,quantity:true,status:true,inspectionExcluded:true,
        majorCategory:true,minorCategory:true,
        storageLocation:{select:{name:true}},
        item:{select:{id:true,name:true,janCode:true,systemBarcode:true,isArchived:true,
          inspectionExcluded:true,majorCategory:true,minorCategory:true}},
      },
      take:51,
      orderBy:{createdAt:"asc"},
    });
    const ids=entries.map(e=>e.id);
    const targets=ids.length ? await prisma.stocktakeTarget.findMany({
      where:{sessionId,inventoryInstanceId:{in:ids}},
      select:{inventoryInstanceId:true},
    }) : [];
    const enrolled=new Set(targets.map(t=>t.inventoryInstanceId));
    const running=session.status==="IN_PROGRESS";

    const stocks=entries.slice(0,50).map(stock=>{
      const scopeMatches=session.scopeType==="ALL"
        ? true : session.scopeType==="LOCATION"
          ? stock.storageLocation?.name===session.scopeValue
          : session.scopeType==="MAJOR_CATEGORY"
            ? (stock.majorCategory??stock.item.majorCategory)===session.scopeValue
            : (stock.minorCategory??stock.item.minorCategory)===session.scopeValue;
      const reasons:string[]=[];
      if(stock.item.isArchived) reasons.push("商品が削除済み");
      if(stock.status==="廃止") reasons.push("在庫明細が削除済み");
      if(stock.inspectionExcluded??stock.item.inspectionExcluded) reasons.push(stock.inspectionExcluded?"在庫明細が棚卸対象外":"商品が棚卸対象外");
      const inSession=enrolled.has(stock.id);
      if(!inSession && !scopeMatches) reasons.push("今回の棚卸範囲（分類・場所）に含まれない");
      if(!inSession && scopeMatches) reasons.push(running?"この棚卸にまだ登録されていない（棚卸画面の再読込で追加）":"この棚卸には未登録（現在の状態では自動追加しない）");
      const excluded=stock.item.isArchived||stock.status==="廃止"||Boolean(stock.inspectionExcluded??stock.item.inspectionExcluded);
      const visible=inSession && !excluded && (!["IN_PROGRESS","PAUSED","REVIEW","CONFLICT"].includes(session.status)||true);
      return {
        id:stock.id,itemId:stock.item.id,itemName:stock.item.name,
        janCode:stock.item.janCode,lotNo:stock.lotNo,location:stock.storageLocation?.name??null,
        quantity:stock.quantity,inSession,scopeMatches,
        visibleInUnfilteredList:visible,reasons,
      };
    });
    return NextResponse.json({session:{id:session.id,title:session.title,status:session.status,
      scopeType:session.scopeType,scopeValue:session.scopeValue},
      totalMatches:entries.length,limited:entries.length>50,stocks,
      note:"一覧表示は未棚卸・棚卸済み・検索・分類・場所の絞り込みでも変わります。変更履歴は操作ログで確認できます。"},
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    console.error("GET /api/stocktake/diagnose",error);
    return NextResponse.json({code:"DIAG_FAILED",message:"棚卸対象の照合に失敗しました。再読み込みして確認してください。"},{status:500});
  }
}
