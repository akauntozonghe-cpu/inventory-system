import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {requireAdmin} from "@/lib/auth";

export const dynamic="force-dynamic";

/** Read-only migration preflight. No stock, master, history, or archive data is ever modified here. */
export async function GET(request:NextRequest){
  const auth=requireAdmin(request);
  if(auth.response)return auth.response;
  try{
    const [
      activeItems,archivedItems,activeStocks,archivedStocks,activeMasters,retiredMasters,
      activeLocations,retiredLocations,stocksInRetiredLocations,
      pendingRequestsInRetiredLocations,stocksOfArchivedItems,
      masters,itemGroups,
    ]=await Promise.all([
      prisma.item.count({where:{isArchived:false}}),
      prisma.item.count({where:{isArchived:true}}),
      prisma.inventoryInstance.count({where:{status:{not:"廃止"}}}),
      prisma.inventoryInstance.count({where:{status:"廃止"}}),
      prisma.classification.count({where:{retiredAt:null}}),
      prisma.classification.count({where:{retiredAt:{not:null}}}),
      prisma.storageLocation.count({where:{retiredAt:null}}),
      prisma.storageLocation.count({where:{retiredAt:{not:null}}}),
      prisma.inventoryInstance.count({where:{status:{not:"廃止"},storageLocation:{is:{retiredAt:{not:null}}}}}),
      prisma.itemRegistrationRequest.count({where:{status:"PENDING",storageLocation:{is:{retiredAt:{not:null}}}}}),
      prisma.inventoryInstance.count({where:{status:{not:"廃止"},item:{isArchived:true}}}),
      prisma.classification.findMany({where:{retiredAt:null},select:{kind:true,name:true,parentName:true}}),
      prisma.item.groupBy({by:["majorCategory","minorCategory"],where:{isArchived:false},_count:{_all:true}}),
    ]);
    const majorNames=new Set(masters.filter(row=>row.kind==="MAJOR").map(row=>row.name));
    const minorKeys=new Set(masters.filter(row=>row.kind==="MINOR").map(row=>JSON.stringify([row.parentName,row.name])));
    let activeItemsWithUnregisteredClassification=0;
    for(const group of itemGroups){
      const major=group.majorCategory,minor=group.minorCategory;
      if((!major&&minor)||(major&&!majorNames.has(major))||(minor&&!minorKeys.has(JSON.stringify([major,minor])))){
        activeItemsWithUnregisteredClassification+=group._count._all;
      }
    }
    return NextResponse.json({
      status:"AUDIT_ONLY",
      knownBlockersClear:stocksInRetiredLocations===0&&pendingRequestsInRetiredLocations===0&&stocksOfArchivedItems===0&&activeItemsWithUnregisteredClassification===0,
      active:{items:activeItems,inventoryInstances:activeStocks,classifications:activeMasters,storageLocations:activeLocations},
      archivedStillInsideActiveTables:{items:archivedItems,inventoryInstances:archivedStocks,classifications:retiredMasters,storageLocations:retiredLocations},
      blockers:{
        activeStocksInRetiredLocations:stocksInRetiredLocations,
        pendingRegistrationRequestsInRetiredLocations:pendingRequestsInRetiredLocations,
        activeStocksLinkedToArchivedItems:stocksOfArchivedItems,
        activeItemsWithUnregisteredClassification,
      },
      note:"この診断は移行を実行しません。廃止記録はまだ物理的に分離されておらず、件数0は履歴FK・QRエイリアスなどの全条件を保証しません。",
    },{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    console.error("GET /api/admin/archive-audit",error);
    return NextResponse.json({code:"ARCHIVE_PREFLIGHT_FAILED",message:"廃止データ分離の事前診断に失敗しました。DB構成と権限を確認してください。"}, {status:500});
  }
}
