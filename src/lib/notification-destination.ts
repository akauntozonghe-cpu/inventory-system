type Notice={type:string;audience?:string;recipientUserId?:string|null;stocktakeSessionId?:string|null;detail?:unknown};
type User={id:string;role:string;featurePermissions?:readonly string[]};
export function canViewNotification(note:Notice,user:User){return note.recipientUserId===user.id||(note.audience==="ADMIN"&&user.role==="ADMIN");}
export function notificationDestination(note:Notice,user:User):{href:string;label:string}|null{
 const detail=note.detail&&typeof note.detail==="object"?note.detail as Record<string,unknown>:{};
 const id=(name:string)=>typeof detail[name]==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(detail[name])?encodeURIComponent(detail[name]):null;
 const allowed=(feature:string)=>user.role==="ADMIN"||user.featurePermissions?.includes(feature);
 if(note.type==="SYSTEM_ERROR")return user.role==="ADMIN"?{href:detail.systemCheckRunId?"/admin/system-check":"/admin/error-reports",label:"管理者の確認画面を開く"}:null;
 if(note.type==="EXPIRY_ALERT")return allowed("CATALOG")?{href:"/expiry",label:"期限管理を開く"}:null;
 if(note.type==="MARKETPLACE_SOLD")return {href:id("marketplaceListingId")?"/marketplace?listingId="+id("marketplaceListingId"):"/marketplace",label:"フリマの出品・発送を確認"};
 if(note.type==="REGISTRATION_REQUEST"&&user.role==="ADMIN"&&note.audience==="ADMIN")return {href:"/admin/registration-requests",label:"商品登録申請を確認"};
 if(id("itemId")&&allowed("CATALOG"))return {href:"/items/"+id("itemId"),label:"商品の詳細を開く"};
 if(note.stocktakeSessionId&&/^[A-Za-z0-9_-]{1,100}$/.test(note.stocktakeSessionId)&&allowed("STOCKTAKE"))return {href:`/stocktake/${encodeURIComponent(note.stocktakeSessionId)}/result`,label:"棚卸の結果を確認"};
 if(note.type==="REGISTRATION_REQUEST"&&allowed("ITEM_REGISTER"))return {href:"/add",label:"商品登録を開く"};
 if(note.type==="LOW_STOCK"&&allowed("CATALOG"))return {href:"/items",label:"在庫を確認"};
 return null;
}
