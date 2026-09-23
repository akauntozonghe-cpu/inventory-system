import { FEATURE_LABELS, type FeatureKey } from "./feature-permissions";
import { displayActionLabel } from "./display-labels";
type JournalStock = { id?: string; lotNo?: string | null; expirationDate?: string | null; majorCategory?: string | null; minorCategory?: string | null; storageLocation?: { name: string } | null; item: { id?: string; name: string; janCode?: string | null; systemBarcode?: string | null } };
export type Activity = {
  date: string;
  summary: { registeredItems: number; stocktakeRecords: number; inventoryEvents: number; adminActions: number };
  items: Array<{ id: string; name: string; janCode: string | null; systemBarcode: string | null; createdAt: string; manufacturer?: string | null; majorCategory?: string | null; minorCategory?: string | null; defaultUnit?: string | null }>;
  records: Array<{ operationAccess?: unknown; id: string; countedQuantity: number; updatedAt: string; session: { id: string; title: string; operator: string | null }; inventoryInstance: JournalStock }>;
  inventoryEvents: Array<{ id: string; eventType: string; quantityChange: number; quantityAfter: number; reason: string | null; memo?: string | null; quantityBefore?: number; detail?: unknown; createdAt: string; performedBy: { displayName: string } | null; inventoryInstance: JournalStock }>;
  adminActions: Array<{ id: string; action: string; route: string | null; detail?: unknown; createdAt: string; adminUser: { displayName: string } }>;
};
export type JournalRow = { id: string; at: string; kind: string; subject: string; detail: string; operator: string; href: string | null; accessLabel?: string; fields: JournalField[]; note?: string; inventoryHref?: string };
export type JournalField = { label: string; value: string; before?: string };
const fieldNames: Record<string,string> = { inventoryInstanceId:"在庫No.", inspectionExcluded:"点検対象外", name:"商品名", itemName:"商品名", janCode:"JAN", systemBarcode:"システムJAN", manufacturer:"メーカー", majorCategory:"大分類", minorCategory:"小分類", defaultUnit:"標準単位", unit:"単位", managementCode:"管理コード", managementGroupCode:"グループコード", quantity:"数量", actualQuantity:"実数", quantityBefore:"変更前の数量", quantityAfter:"変更後の数量", quantityChange:"増減", lotNo:"Lot", expirationDate:"期限", expirationManagementStatus:"期限管理", expirationAlertDays:"通知日数", storageLocationName:"保管場所", storageLocationId:"保管場所ID", allocationType:"用途", status:"状態", stocktakeStatus:"棚卸状態", reason:"理由", memo:"メモ", note:"メモ", displayName:"利用者名", role:"権限", isActive:"有効", isArchived:"廃止", archiveReason:"廃止理由", title:"名称", operator:"担当者", countedQuantity:"棚卸の実数", action:"操作", fileName:"ファイル名", originalName:"ファイル名", size:"容量", count:"件数" };
const values:Record<string,string>={home:"自宅用",flea_market:"フリマ用",warehouse:"倉庫保管",ADMIN:"管理者",WORKER:"作業者",ACTIVE:"有効",ARCHIVED:"廃止",MANAGED:"期限管理対象",UNSET:"未設定",NO_EXPIRY:"期限管理不要"};
function object(value:unknown):Record<string,unknown>{return value && typeof value === "object" && !Array.isArray(value)?value as Record<string,unknown>:{};}
function display(value:unknown,key:string){if(value===undefined)return "未記録";if(value===null||value==="")return "未設定";if(typeof value==="boolean")return value?"はい":"いいえ";const text=String(value);return ["allocationType","role","status","expirationManagementStatus"].includes(key)?values[text]??text:text;}
function scalar(value:unknown){return value===null || ["string","number","boolean"].includes(typeof value);}
export function journalFields(value:unknown):JournalField[]{
  const data=object(value), before=object(data.before), after=object(data.after);
  const fields:JournalField[]=[];
  for(const [key,label] of Object.entries(fieldNames)){
    if(Object.hasOwn(before,key)||Object.hasOwn(after,key)){
      const old=before[key], next=after[key];
      if((scalar(old)||old===undefined)&&(scalar(next)||next===undefined)&&JSON.stringify(old)!==JSON.stringify(next)) fields.push({label,before:display(old,key),value:display(next,key)});
    }else if(Object.hasOwn(data,key)&&scalar(data[key])) fields.push({label,value:display(data[key],key)});
  }
  for(const key of ["item","inventory"]){for(const field of journalFieldsFlat(data[key]))fields.push({...field,label:(key==="inventory"?"在庫・":"商品・")+field.label});}
  const permissionsBefore=Array.isArray(data.before)?data.before:before.featurePermissions;
  const permissionsAfter=Array.isArray(data.after)?data.after:after.featurePermissions;
  if(Array.isArray(permissionsBefore)||Array.isArray(permissionsAfter)){
    const names=(value:unknown)=>Array.isArray(value)?value.map(key=>typeof key==="string"?(FEATURE_LABELS[key as FeatureKey]?.title??key):"").filter(Boolean).join("、")||"なし":"未記録";
    fields.push({label:"通常の利用権限",before:names(permissionsBefore),value:names(permissionsAfter)});
  }
  if(typeof data.grantType==="string")fields.push({label:"許可の種類",value:data.grantType});
  return fields;
}
function journalFieldsFlat(value:unknown):JournalField[]{const data=object(value);return Object.entries(fieldNames).flatMap(([key,label])=>Object.hasOwn(data,key)&&scalar(data[key])?[{label,value:display(data[key],key)}]:[]);}
export function journalAccess(value:unknown):{label:string;fields:JournalField[];actorName?:string}{
  const data=object(value), explicit=object(data.authorization);
  const access=typeof explicit.mode==="string"?explicit:object(data.access), mode=access.mode;
  const labels:Record<string,string>={ASSIGNED_PERMISSION:"付与された編集権限",STANDARD_ADMIN:"管理者が実行",TEMPORARY_ADMIN:"一時管理者が実行",STANDARD_USER:"通常の利用権限"};
  const label=typeof mode==="string"&&labels[mode]?labels[mode]:"権限状態：未記録";
  const fields:JournalField[]=[{label:"操作時の権限",value:label}];
  if(typeof access.actorName==="string")fields.push({label:"実際の操作者",value:access.actorName});
  if(typeof access.feature==="string")fields.push({label:"使用した編集権限",value:FEATURE_LABELS[access.feature as FeatureKey]?.title??access.feature});
  if(mode==="TEMPORARY_ADMIN"){
    if(typeof access.authorizedByName==="string")fields.push({label:"許可した管理者",value:access.authorizedByName});
    else if(typeof access.authorizedById==="string")fields.push({label:"許可者ID",value:access.authorizedById});
    if(typeof access.expiresAt==="number"&&Number.isFinite(access.expiresAt))fields.push({label:"一時権限の期限",value:new Date(access.expiresAt).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})});
    fields.push({label:"権限の意味",value:access.usedForEdit?"一時管理者の許可で編集した操作です。":"管理者認証中の操作です。通常の管理者ログインとは区別して記録しています。"});
  }
  return {label,fields,...(typeof access.actorName==="string"?{actorName:access.actorName}:{})};
}
export function journalRows(activity: Activity): JournalRow[] {
  return [
    ...activity.items.map(item => {
      const registration=activity.adminActions.find(entry=>entry.action==="ITEM_REGISTER"&&object(entry.detail).itemId===item.id);
      const saved=object(registration?.detail);const access=journalAccess(registration?.detail);
      return { id:"i-"+item.id,at:item.createdAt,kind:"商品登録",subject:typeof saved.itemName==="string"?saved.itemName:item.name,detail:registration ? String(saved.janCode || saved.systemBarcode || "コードなし") : item.janCode||item.systemBarcode||"コードなし",operator:access.actorName||registration?.adminUser.displayName||"—",accessLabel:access.label,href:"/items/"+encodeURIComponent(item.id),fields:[...access.fields,...journalFields(registration?.detail??item)],note:registration?"保存されている登録時の内容です。古い記録では一部の項目が未記録です。":"登録時の詳細記録がないため、現在の商品情報を表示しています。登録当時の内容とは異なる場合があります。"};
    }),
    ...activity.records.map(record => {const access=journalAccess({access:record.operationAccess});return ({ id: "r-" + record.id, at: record.updatedAt, kind: "棚卸入力", subject: record.inventoryInstance.item.name, detail: "実数 " + record.countedQuantity + " ／ " + record.session.title, operator: access.actorName || record.session.operator || "未設定",accessLabel:access.label, href: "/stocktake/" + encodeURIComponent(record.session.id),fields:[...access.fields,...journalFields({countedQuantity:record.countedQuantity,title:record.session.title,operator:record.session.operator})],note:"保存されている棚卸入力です。" });}),
    ...activity.inventoryEvents.map(event => {const access=journalAccess(event.detail);return ({ id: "e-" + event.id, at: event.createdAt, kind: "在庫変更", subject: typeof object(event.detail).itemName==="string"?String(object(event.detail).itemName):event.inventoryInstance.item.name, detail: displayActionLabel(event.eventType) + " ／ 増減 " + (event.quantityChange >= 0 ? "+" : "") + event.quantityChange + " → " + event.quantityAfter + (event.reason ? " ／ " + event.reason : ""), operator: access.actorName || event.performedBy?.displayName || "システム",accessLabel:access.label, href: null,fields:[...access.fields,...journalFields({...object(event.detail),quantityBefore:event.quantityBefore,quantityAfter:event.quantityAfter,quantityChange:event.quantityChange,reason:event.reason,memo:event.memo})] });}),
    ...activity.adminActions.filter(entry => !(entry.action === "ITEM_REGISTER" && activity.items.some(item => item.id === object(entry.detail).itemId))).map(entry => {const access=journalAccess(entry.detail);const data=object(entry.detail),after=object(data.after),before=object(data.before);const name=data.itemName??after.name??before.name;const itemId=data.itemId??(entry.action==="ITEM_UPDATE"?(after.id??before.id):undefined);const fields=journalFields(data);return { id: "a-" + entry.id, at: entry.createdAt, kind: "変更・承認", subject: displayActionLabel(entry.action)+(typeof name==="string"?" ／ "+name:""), detail:fields.filter(field=>field.before!==undefined).map(field=>field.label+"："+field.before+" → "+field.value).slice(0,2).join(" ／ "), operator: access.actorName ?? entry.adminUser.displayName, accessLabel: access.label, href: typeof itemId==="string"?"/items/"+encodeURIComponent(itemId):null,fields:[...access.fields,...fields],note:fields.length?"保存されている操作内容です。変更のある項目は変更前と変更後を表示します。":"この操作には表示できる詳細が保存されていません。"}; }),
  ].map((row: JournalRow): JournalRow => {
    const stock = row.id.startsWith("r-") ? activity.records.find(entry => "r-" + entry.id === row.id)?.inventoryInstance : row.id.startsWith("e-") ? activity.inventoryEvents.find(entry => "e-" + entry.id === row.id)?.inventoryInstance : undefined;
    const saved = object(activity.adminActions.find(entry => "a-" + entry.id === row.id)?.detail);
    const inventoryId = stock?.id ?? saved.inventoryInstanceId;
    const itemId = stock?.item.id ?? saved.itemId;
    const jan = stock?.item.janCode ?? stock?.item.systemBarcode ?? saved.janCode ?? saved.systemBarcode;
    const inventoryHref = typeof itemId === "string" && typeof inventoryId === "string" ? "/items/" + encodeURIComponent(itemId) + "?inventoryId=" + encodeURIComponent(inventoryId) : undefined;
    const identity = stock ? journalFields({janCode:jan, inventoryInstanceId:inventoryId, lotNo:stock.lotNo, expirationDate:stock.expirationDate, majorCategory:stock.majorCategory, minorCategory:stock.minorCategory, storageLocationName:stock.storageLocation?.name}) : [];
    return {...row, inventoryHref, href: row.kind === "在庫変更" || row.kind === "変更・承認" ? inventoryHref ?? row.href : row.href,
      detail: [jan ? "JAN：" + jan : "", typeof inventoryId === "string" ? "在庫No.：" + inventoryId : "", row.detail].filter(Boolean).join(" ／ "),
      fields:[...identity,...row.fields], note:stock ? [row.note,"対象在庫のJAN・Lot・期限・分類・保管場所は現在の情報です。"].filter(Boolean).join(" ") : row.note};
  }).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
export function journalTime(value: string) {
  return new Date(value).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}
