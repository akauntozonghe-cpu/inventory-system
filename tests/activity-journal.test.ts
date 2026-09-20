import { describe, expect, it } from "vitest";
import { journalRows, journalTime, journalFields, type Activity } from "../src/lib/activity-journal";
describe("activity journal", () => {
  const activity: Activity = {date:"2026-09-14", summary:{registeredItems:1,stocktakeRecords:1,inventoryEvents:1,adminActions:1},items:[{id:"1",name:"白い皿",janCode:null,systemBarcode:"2000000000008",createdAt:"2026-09-14T01:00:00Z"}],records:[{id:"1",countedQuantity:0,updatedAt:"2026-09-14T00:00:00Z",session:{id:"s",title:"食器の棚卸",operator:"田中"},inventoryInstance:{item:{name:"茶碗"}}}],inventoryEvents:[{id:"1",eventType:"ADJUSTMENT",quantityChange:-2,quantityAfter:0,reason:"破損",createdAt:"2026-09-14T02:00:00Z",performedBy:null,inventoryInstance:{item:{name:"茶碗"}}}],adminActions:[{id:"1",action:"LOGIN",route:null,createdAt:"2026-09-14T03:00:00Z",adminUser:{displayName:"管理者"}}]};
  it("keeps all operation types in chronological order without losing zero counts or adjustment reasons", () => {
    const rows=journalRows(activity);
    expect(rows.map(row=>row.kind)).toEqual(["棚卸入力","商品登録","在庫変更","管理操作"]);
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
  it("uses Japanese time regardless of the viewing device timezone", () => {
    expect(journalTime("2026-09-13T15:05:00Z")).toBe("00:05");
  });
});
