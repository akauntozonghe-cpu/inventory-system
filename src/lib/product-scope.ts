// Operational stock and inspection scope deliberately share the archive rule.
// Inspection exemptions do not remove valid products from normal stocktake work.
export const activeItemWhere = {isArchived:false} as const;
export const activeInventoryWhere = {status:{not:"廃止"},item:{isArchived:false}} as const;
export const inspectionItemWhere = {isArchived:false,inspectionExcluded:false} as const;
export const inspectionInventoryWhere = {status:{not:"廃止"},item:inspectionItemWhere} as const;
export function isInspectionTarget(item:{isArchived?:boolean;inspectionExcluded?:boolean},status?:string){return !item.isArchived&&!item.inspectionExcluded&&status!=="廃止";}
export function productCodes(item:{id:string;janCode?:string|null;systemBarcode?:string|null}){
  return {managementNo:item.id,label:item.janCode?"JAN":item.systemBarcode?"システムJAN":"JAN未設定",code:item.janCode||item.systemBarcode||null};
}
