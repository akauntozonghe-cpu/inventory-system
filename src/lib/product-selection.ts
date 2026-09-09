export type SelectableProduct={id:string;name:string;janCode:string|null;systemBarcode:string|null;managementCode?:string|null;inventoryInstances?:Array<{id:string;storageLocationId?:string|null}>};
export const normalizeScanCode=(value:string)=>value.normalize("NFKC").replace(/[\s-]/g,"").toLowerCase();
export function productScanIndex<T extends SelectableProduct>(items:T[]) {
  const index=new Map<string,T[]>();
  for(const item of items){const codes=new Set([item.id,item.janCode,item.systemBarcode,item.managementCode,...(item.inventoryInstances??[]).map(row=>row.id)].filter((value):value is string=>!!value).map(normalizeScanCode));for(const code of codes){const rows=index.get(code)??[];rows.push(item);index.set(code,rows);}}
  return index;
}
export function addProductSelection(current:string[],ids:string[],limit=500){const next=[...new Set([...current,...ids])];if(next.length>limit)throw new Error(`SELECTION_LIMIT：一度に選択できるのは${limit}商品までです。先に変更を確定してください。`);return next;}
