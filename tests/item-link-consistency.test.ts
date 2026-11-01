import { expect, it, vi } from "vitest";
import { syncItemLinks } from "../src/lib/item-links";
import { inventoryCategoryWhere } from "../src/lib/inventory-category";
import { inspectionInventoryWhere } from "../src/lib/product-scope";

function linkedTx() {
  const updateMany = vi.fn().mockResolvedValue({count:2});
  const upsert = vi.fn().mockResolvedValue({});
  return {tx:{inventoryInstance:{updateMany},classification:{upsert}}, updateMany,upsert};
}

it("propagates shared metadata to matching inherited copies without touching lot-specific values",async()=>{
  const {tx,updateMany,upsert}=linkedTx();
  await syncItemLinks(tx as never,"item-1",{
    manufacturer:"旧メーカー",majorCategory:"食品",minorCategory:"菓子",defaultUnit:"個",
  },{
    manufacturer:"新メーカー",majorCategory:"飲料",minorCategory:"茶",defaultUnit:"本",
  });
  expect(updateMany).toHaveBeenCalledTimes(4);
  const writes=updateMany.mock.calls.map(([args])=>args);
  expect(writes[0]).toMatchObject({where:{itemId:"item-1",status:{not:"廃止"},manufacturer:"旧メーカー"},data:{manufacturer:"新メーカー"}});
  expect(writes[1]).toMatchObject({where:{itemId:"item-1",unit:"個"},data:{unit:"本"}});
  expect(writes[2]).toMatchObject({where:{itemId:"item-1",majorCategory:"食品"},data:{majorCategory:"飲料"}});
  expect(writes[3]).toMatchObject({where:{itemId:"item-1",minorCategory:"菓子"},data:{minorCategory:"茶"}});
  expect(writes.every(write=>!["quantity","actualQuantity","lotNo","expirationDate","storageLocationId"].some(field=>field in write.data))).toBe(true);
  expect(upsert).toHaveBeenCalledTimes(2);
});

it("retains null fields as inherited references and leaves unchanged fields alone",async()=>{
 const {tx,updateMany,upsert}=linkedTx();
 await syncItemLinks(tx as never,"item-2",{
  manufacturer:null,majorCategory:null,minorCategory:null,defaultUnit:null,
 },{
  manufacturer:"メーカー",majorCategory:"食品",minorCategory:"菓子",defaultUnit:"個",
 });
 expect(updateMany).not.toHaveBeenCalled();
 expect(upsert).toHaveBeenCalledTimes(2);
});

it("does not write any stock metadata when the item has not changed",async()=>{
 const {tx,updateMany,upsert}=linkedTx();
 const fields={manufacturer:"メーカー",majorCategory:"食品",minorCategory:"菓子",defaultUnit:"個"};
 await syncItemLinks(tx as never,"item-3",fields,fields);
 expect(updateMany).not.toHaveBeenCalled();
 expect(upsert).not.toHaveBeenCalled();
});

it("inventory category filtering inherits the catalog only when the stock has no override",()=>{
 expect(inventoryCategoryWhere("majorCategory","飲料")).toEqual({OR:[
  {majorCategory:"飲料"},
  {majorCategory:null,item:{is:{majorCategory:"飲料"}}},
 ]});
 expect(inspectionInventoryWhere).toMatchObject({status:{not:"廃止"},item:{isArchived:false}});
});
