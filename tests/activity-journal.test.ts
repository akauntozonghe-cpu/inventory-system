import { describe, expect, it } from "vitest";
import { journalRows, journalTime, journalFields, journalAccess, type Activity } from "../src/lib/activity-journal";
describe("activity journal", () => {
  const activity: Activity = {date:"2026-09-14", summary:{registeredItems:1,stocktakeRecords:1,inventoryEvents:1,adminActions:1},items:[{id:"1",name:"白い皿",janCode:null,systemBarcode:"2000000000008",createdAt:"2026-09-14T01:00:00Z"}],records:[{id:"1",countedQuantity:0,updatedAt:"2026-09-14T00:00:00Z",session:{id:"s",title:"食器の棚卸",operator:"田中"},inventoryInstance:{item:{name:"茶碗"}}}],inventoryEvents:[{id:"1",eventType:"ADJUSTMENT",quantityChange:-2,quantityAfter:0,reason:"破損",createdAt:"2026-09-14T02:00:00Z",performedBy:null,inventoryInstance:{item:{name:"茶碗"}}}],adminActions:[{id:"1",action:"LOGIN",route:null,createdAt:"2026-09-14T03:00:00Z",adminUser:{displayName:"管理者"}}]};
  it("keeps all operation types in chronological order without losing zero counts or adjustment reasons", () => {
    const rows=journalRows(activity);
    expect(rows.map(row=>row.kind)).toEqual(["棚卸入力","商品登録","在庫変更","変更・承認"]);
    expect(new Set(rows.map(row=>row.id)).size).toBe(4);
    expect(rows[0].detail).toContain("実数 0");
    expect(rows[1].detail).toBe("2000000000008");
    expect(rows[2].detail).toContain("-2 → 0 ／ 破損");
    expect(rows[2].operator).toBe("システム");
    expect(activity.records[0].id).toBe("1");
  });
  it("shows changed values, explicit clearing, and reasons without exposing credentials", () => {
    const fields=journalFields({reason:"分類訂正",before:{name:"白皿",majorCategory:"未分類",janCode:"4901234567894"},after:{name:"白皿",majorCategory:"食器",janCode:null},password:"secret",token:"secret"});
    expect(fields).toContainEqual({label:"大分類",before:"未分類",value:"食器"});
    expect(fields).toContainEqual({label:"JAN",before:"4901234567894",value:"未設定"});
    expect(fields).toContainEqual({label:"理由",value:"分類訂正"});
    expect(fields.some(field=>field.label==="商品名")).toBe(false);
    expect(JSON.stringify(fields)).not.toContain("secret");
    expect(journalFields({before:{quantity:3},after:{}})).toContainEqual({label:"数量",before:"3",value:"未記録"});
    expect(journalFields({name:"ADMIN"})).toContainEqual({label:"商品名",value:"ADMIN"});
  });
  it("uses saved registration snapshots and clearly marks the current-info fallback", () => {
    const saved={...activity,adminActions:[{id:"registration",action:"ITEM_REGISTER",route:null,createdAt:activity.items[0].createdAt,adminUser:{displayName:"登録担当"},detail:{itemId:"1",itemName:"登録時の皿",item:{manufacturer:"製造元",majorCategory:"食器"},inventory:{quantity:8,storageLocationName:"食器棚",lotNo:"A-1"}}}]};
    const row=journalRows(saved).find(row=>row.kind==="商品登録")!;
    expect(row.subject).toBe("登録時の皿");expect(row.operator).toBe("登録担当");
    expect(row.fields).toContainEqual({label:"在庫・数量",value:"8"});
    expect(row.fields).toContainEqual({label:"在庫・保管場所",value:"食器棚"});
    expect(journalRows(activity).find(row=>row.kind==="商品登録")?.note).toContain("現在の商品情報");
  });
  it("never infers historical privileges from an actor's current role",()=>{
    expect(journalAccess({}).label).toBe("権限状態：未記録");
    const value=journalAccess({access:{mode:"TEMPORARY_ADMIN",actorName:"作業者",authorizedByName:"承認者",expiresAt:Date.UTC(2026,8,21)}});
    expect(value.label).toBe("一時管理者が実行");expect(value.actorName).toBe("作業者");expect(value.fields).toContainEqual({label:"許可した管理者",value:"承認者"});
    expect(value.fields.some(field=>field.value.includes("区別して記録"))).toBe(true);
  });
  it("shows saved authority for stocktake and inventory event rows",()=>{const saved={...activity,records:activity.records.map(row=>({...row,operationAccess:{mode:"TEMPORARY_ADMIN",actorName:"入力者",authorizedByName:"管理者"}})),inventoryEvents:activity.inventoryEvents.map(row=>({...row,detail:{access:{mode:"STANDARD_ADMIN",actorName:"管理者"}}}))};const rows=journalRows(saved);expect(rows.find(row=>row.kind==="棚卸入力")).toMatchObject({operator:"入力者",accessLabel:"一時管理者が実行"});expect(rows.find(row=>row.kind==="在庫変更")?.accessLabel).toBe("管理者が実行");});
  it("uses Japanese time regardless of the viewing device timezone", () => {
    expect(journalTime("2026-09-13T15:05:00Z")).toBe("00:05");
  });
  it("keeps same-JAN stock events separate and links to the exact inventory", () => {
    const shared = {id:"item", name:"同じ商品", janCode:"4901234567894"};
    const entries = ["stock-a", "stock-b"].map((id,index) => ({...activity.inventoryEvents[0], id, inventoryInstance:{id, lotNo:"LOT-"+index, expirationDate:"2027-0"+(index+1), majorCategory:"分類"+index, minorCategory:null, storageLocation:{name:"場所"+index}, item:shared}}));
    const rows = journalRows({...activity,items:[],records:[],adminActions:[],inventoryEvents:entries});
    expect(rows).toHaveLength(2);
    rows.forEach((row,index) => {
      expect(row.detail).toContain("JAN：4901234567894");
      expect(row.href).toBe("/items/item?inventoryId="+entries[index].id);
      expect(row.fields).toContainEqual({label:"Lot",value:"LOT-"+index});
      expect(row.fields).toContainEqual({label:"大分類",value:"分類"+index});
    });
  });
  it("links a lifecycle audit to the selected stock rather than all stock sharing its JAN", () => {
    const rows = journalRows({...activity,items:[],records:[],inventoryEvents:[],adminActions:[{...activity.adminActions[0],action:"INVENTORY_ARCHIVE",detail:{itemId:"item",inventoryInstanceId:"test-stock",janCode:"4901234567894",lotNo:"TEST",before:{status:"在庫中"},after:{status:"廃止"}}}]});
    expect(rows[0].href).toBe("/items/item?inventoryId=test-stock");
    expect(rows[0].subject).toBe("個別在庫を廃止");
    expect(rows[0].detail).toContain("JAN：4901234567894");
  });
});
