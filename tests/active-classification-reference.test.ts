import {describe,expect,it,vi} from "vitest";
import {requireActiveClassification} from "../src/lib/item-links";

describe("active classification reference constraints",()=>{
  const tx=(records:Record<string,{id:string;retiredAt:Date|null}|null>)=>({
    classification:{findUnique:vi.fn(async(args:{where:{kind_name_parentName:{kind:string;name:string;parentName:string}}})=>{
      const k=args.where.kind_name_parentName;
      return records[k.kind+"|"+k.parentName+"|"+k.name]??null;
    }),upsert:vi.fn()},
  });
  it("accepts uncategorized items only when both category levels are blank",async()=>{
    const db=tx({});
    await expect(requireActiveClassification(db as never,null,null)).resolves.toBeUndefined();
    await expect(requireActiveClassification(db as never,null,"小分類")).rejects.toThrow("CLASSIFICATION_PARENT_REQUIRED");
    expect(db.classification.upsert).not.toHaveBeenCalled();
  });
  it("rejects absent and retired parents without auto-creating",async()=>{
    const db=tx({"MAJOR||廃止済":{id:"old",retiredAt:new Date()}});
    await expect(requireActiveClassification(db as never,"未登録",null)).rejects.toThrow("CLASSIFICATION_TARGET_NOT_ACTIVE");
    await expect(requireActiveClassification(db as never,"廃止済",null)).rejects.toThrow("CLASSIFICATION_TARGET_NOT_ACTIVE");
    expect(db.classification.upsert).not.toHaveBeenCalled();
  });
  it("requires the child to belong to an active parent",async()=>{
    const db=tx({"MAJOR||食品":{id:"major",retiredAt:null},"MINOR|食品|菓子":{id:"minor",retiredAt:null},
      "MINOR|食品|旧分類":{id:"old",retiredAt:new Date()}});
    await expect(requireActiveClassification(db as never,"食品","菓子")).resolves.toBeUndefined();
    await expect(requireActiveClassification(db as never,"食品","旧分類")).rejects.toThrow("CLASSIFICATION_TARGET_NOT_ACTIVE");
    await expect(requireActiveClassification(db as never,"食品","生活用品")).rejects.toThrow("CLASSIFICATION_TARGET_NOT_ACTIVE");
    expect(db.classification.upsert).not.toHaveBeenCalled();
  });
});
