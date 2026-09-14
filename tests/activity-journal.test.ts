import { describe, expect, it } from "vitest";
import { journalRows, journalTime, type Activity } from "../src/lib/activity-journal";
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
  it("uses Japanese time regardless of the viewing device timezone", () => {
    expect(journalTime("2026-09-13T15:05:00Z")).toBe("00:05");
  });
});
