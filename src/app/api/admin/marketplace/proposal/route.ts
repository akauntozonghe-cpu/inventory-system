import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireLogin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RESERVED_LISTING_STATUSES } from "@/lib/stock-state";
import { officialRates, SHIPPING_GUIDES, parcelFit, proposalNumbers, type Parcel, type DeliveryOption } from "@/lib/marketplace-assistance";

function optionalNumber(value:unknown,max:number) { if(value===undefined||value===null||value==="")return null;const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=max?n:NaN; }
export async function POST(request:NextRequest) {
  const auth=requireLogin(request);if(auth.response)return auth.response;
  // A decimal correlation identifier is internal; entity foreign keys remain unchanged.
  const operationId=BigInt("0x"+randomUUID().replaceAll("-","")).toString();
  const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store","X-Operation-Id":operationId}});
  try {
    const body=await request.json().catch(()=>null);
    const id=typeof body?.inventoryInstanceId==="string"?body.inventoryInstanceId:"";
    const channel=typeof body?.channel==="string"?body.channel:"mercari";
    const quantity=Number(body?.quantity??1);
    const condition=typeof body?.condition==="string"?body.condition.trim().slice(0,100):"";
    const packaging=optionalNumber(body?.packagingCost,1000000);
    const supplied:Parcel={weight:optionalNumber(body?.weight,1000000),length:optionalNumber(body?.length,1000),width:optionalNumber(body?.width,1000),height:optionalNumber(body?.height,1000)};
    if(!id||id.length>100||!Number.isInteger(quantity)||quantity<1||quantity>100000||Number.isNaN(packaging)||Object.values(supplied).some(n=>n!==null&&(!Number.isFinite(n)||n<=0)))return reply({code:"MARKETPLACE_PROPOSAL_INPUT",message:"出品数は1以上、梱包後の大きさ・重さは0より大きい数で入力してください。"},400);
    const [inventory,channelSetting,setting,rates]=await Promise.all([
      prisma.inventoryInstance.findUnique({where:{id},include:{item:true,marketplaceListings:{where:{status:{in:[...RESERVED_LISTING_STATUSES]}},select:{listedQuantity:true}}}}),
      prisma.salesChannelSetting.findUnique({where:{channel}}),
      prisma.salesRecommendationSetting.findUnique({where:{id:"system"}}),
      prisma.shippingRate.findMany({where:{channel:{in:[channel,"all"]},isActive:true,effectiveFrom:{lte:new Date()},OR:[{effectiveTo:null},{effectiveTo:{gte:new Date()}}]},orderBy:{effectiveFrom:"desc"}}),
    ]);
    if(!inventory||inventory.item.isArchived||inventory.status==="廃止")return reply({code:"MARKETPLACE_PROPOSAL_NOT_FOUND",message:"この在庫は出品対象ではありません。別の在庫を選んでください。"},404);
    const available=inventory.quantity-inventory.marketplaceListings.reduce((sum,row)=>sum+row.listedQuantity,0);
    if(quantity>available)return reply({code:"MARKETPLACE_STOCK_SHORTAGE",message:`出品に使える数は${Math.max(available,0)}です。数量を変更してください。`},409);
    const history=condition?await prisma.marketplaceListing.findMany({where:{status:"SOLD",channel,itemCondition:condition,soldQuantity:{gt:0},soldAt:{gte:new Date(Date.now()-365*86400000)},inventoryInstance:{itemId:inventory.itemId}},select:{price:true},orderBy:{soldAt:"desc"},take:30}):[];
    const parcel:Parcel={weight:supplied.weight??(quantity===1?inventory.packageWeightGrams:null),length:supplied.length??(quantity===1?inventory.packageLengthCm:null),width:supplied.width??(quantity===1?inventory.packageWidthCm:null),height:supplied.height??(quantity===1?inventory.packageHeightCm:null)};
    const feeBps=channelSetting?.feeRateBps??(channel==="mercari"?1000:channel==="yahoo_furima"?500:null);
    const seen=new Set<string>();
    const configured:DeliveryOption[]=rates.filter(r=>!r.originPrefecture||r.originPrefecture===setting?.shippingOriginPrefecture).sort((a,b)=>Number(Boolean(b.originPrefecture))-Number(Boolean(a.originPrefecture))).filter(r=>{const key=r.channel+":"+r.carrier+":"+r.methodName;if(seen.has(key))return false;seen.add(key);return true;}).map(r=>({id:r.id,name:r.carrier+" "+r.methodName,fee:r.fee,boxCost:null,maxWeight:r.maxWeightGrams,maxTotal:r.maxTotalDimensionsCm,maxLength:r.maxLengthCm,maxWidth:r.maxWidthCm,maxHeight:r.maxHeightCm,source:null,checkedAt:null,note:"共通の送料表に登録された料金。専用資材・最小寸法などを公式案内で確認してください。"}));
    const options=configured.length?configured:officialRates(channel);
    const methods=options.map(option=>({...option,fit:parcelFit(parcel,option),packagingCost:packaging??option.boxCost,numbers:proposalNumbers({history:history.map(row=>row.price),acquisitionCost:inventory.acquisitionCost,quantity,shipping:option.fee,packaging:packaging??option.boxCost,feeBps,targetBps:setting?.targetProfitRateBps??2000})})).filter(option=>option.fit!=="NO").sort((a,b)=>(a.fit===b.fit?0:a.fit==="MATCH"?-1:1)||(a.fee+(a.packagingCost??0))-(b.fee+(b.packagingCost??0)));
    console.info("MARKETPLACE_PROPOSAL_COMPLETE",{operationId,inventoryInstanceId:id});
    return reply({engine:"EVIDENCE",shippingOriginPrefecture:setting?.shippingOriginPrefecture??null,shippingLeadDays:setting?.shippingLeadDays??null,inventoryInstanceId:id,itemName:inventory.item.name,quantity,available,parcel,feeBps,feeNote:channelSetting?"共通設定の手数料率":feeBps!==null?"通常手数料の目安（キャンペーン・端数差は含みません）":"販売先の手数料を確認してください",methods,guide:SHIPPING_GUIDES[channel]??null,historyCount:history.length,missing:[...(!condition?["商品の状態を選ぶと、同じ商品の同じ状態の販売履歴を比較できます。"]:[]),...(Object.values(parcel).some(v=>v===null)?["発送する分をまとめて梱包した、大きさ・重さを確認してください。"]:[]),...(inventory.acquisitionCost===null?["原価が未登録のため、利益は確定できません。"]:[]),...(packaging===null?["梱包費は商品ごとに指定できます。専用BOX代は候補に含めています。"]:[]),...(methods.length?[]:["一致する送料の候補がありません。梱包サイズまたは販売先の公式案内を確認してください。"])],draft:{title:inventory.item.name,description:`${inventory.item.name}\n\n状態：${condition||"要確認"}\n付属品：要確認\n傷・動作：要確認\n\n写真と商品説明をご確認ください。`}});
  } catch {console.error("MARKETPLACE_PROPOSAL_FAILED",{operationId});return reply({code:"MARKETPLACE_PROPOSAL_FAILED",message:"提案を取得できませんでした。入力内容はそのままで、もう一度お試しください。"},503);}
}
