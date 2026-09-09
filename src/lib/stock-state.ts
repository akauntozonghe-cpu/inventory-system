import { displayUnit } from "./unit";

// Reservations are still part of quantity. SOLD was already deducted by the sale transaction.
export const RESERVED_LISTING_STATUSES = ["DRAFT", "READY", "LISTED"] as const;
export const marketplaceStockSelect = { id:true, status:true, shippingStatus:true, listedQuantity:true, soldQuantity:true } as const;
export type StockListing = { id:string; status:string; shippingStatus:string; listedQuantity:number; soldQuantity:number };
export type LinkedStock = { quantity:number; unit?:string|null; allocationType?:string; marketplaceListings?:StockListing[] };
export const availableStock=(quantity:number,reserved:number)=>Math.max(0,quantity-reserved);
export function stockState(stock:LinkedStock) {
  const listings=stock.marketplaceListings??[];
  let preparing=0,listed=0,shipping=0,shipped=0;
  for(const row of listings) {
    if(row.status==="DRAFT"||row.status==="READY")preparing+=row.listedQuantity;
    if(row.status==="LISTED")listed+=row.listedQuantity;
    if(row.status==="SOLD") {
      if(["SHIPPED","DELIVERED","SETTLED"].includes(row.shippingStatus))shipped+=row.soldQuantity;
      else shipping+=row.soldQuantity;
    }
  }
  const reserved=preparing+listed;
  return {quantity:stock.quantity,preparing,listed,reserved,available:availableStock(stock.quantity,reserved),shortage:Math.max(0,reserved-stock.quantity),shipping,shipped,
    unlistedAllocation:stock.allocationType==="flea_market"&&!listings.some(row=>row.status!=="CANCELLED")};
}
export const stockFilterLabels={ALL:"すべての状態",AVAILABLE:"通常在庫あり",PREPARING:"フリマ準備中",LISTED:"フリマ出品中",SHIPPING:"売却済み・発送前",SHIPPED:"発送済みの履歴あり",EMPTY:"登録在庫なし",SHORTAGE:"確保数が在庫を超過"} as const;
export type StockFilter=keyof typeof stockFilterLabels;
export function matchesStockFilter(stocks:LinkedStock[],filter:StockFilter) {
  if(filter==="ALL")return true;
  if(filter==="EMPTY")return !stocks.some(row=>row.quantity>0);
  return stocks.some(row=>{const state=stockState(row);return ({AVAILABLE:state.available>0,PREPARING:state.preparing>0||state.unlistedAllocation,LISTED:state.listed>0,SHIPPING:state.shipping>0,SHIPPED:state.shipped>0,SHORTAGE:state.shortage>0} as const)[filter];});
}
export function summarizeStock(stocks:LinkedStock[],defaultUnit?:string|null) {
  const units=new Map<string,ReturnType<typeof stockState>>();
  for(const row of stocks){const unit=displayUnit(row.unit,defaultUnit),value=stockState(row),previous=units.get(unit);if(!previous){units.set(unit,{...value});continue;}for(const key of ["quantity","preparing","listed","reserved","available","shortage","shipping","shipped"] as const)previous[key]+=value[key];previous.unlistedAllocation ||= value.unlistedAllocation;}
  if(!units.size)units.set(displayUnit(defaultUnit),stockState({quantity:0}));
  return [...units].map(([unit,state])=>({unit,...state}));
}
