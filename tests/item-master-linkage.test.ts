import {expect,it,vi} from "vitest";
import type {Prisma} from "@prisma/client";
import {syncItemLinks} from "../src/lib/item-links";
import {inventoryCategoryWhere} from "../src/lib/inventory-category";

function mockTx(){
  const stock=vi.fn().mockResolvedValue({count:1});
  const classification=vi.fn().mockResolvedValue({});
  return {
    tx:{inventoryInstance:{updateMany:stock},classification:{upsert:classification}} as unknown as Prisma.TransactionClient,
    stock, classification,
  };
}

it("syncs only matching inherited shared values and excludes deleted stock",async()=>{
  const {tx,stock}=mockTx();
  await syncItemLinks(tx,"item",{
    manufacturer:"メーカー旧",majorCategory:"食品",minorCategory:"飲料",defaultUnit:"個",
  },{
    manufacturer:"メーカー新",majorCategory:"日用品",minorCategory:"洗剤",defaultUnit:"本",
  });
  const updates=stock.mock.calls.map(([arg])=>arg);
  expect(updates).toEqual(expect.arrayContaining([
    expect.objectContaining({
      where:expect.objectContaining({itemId:"item",status:{not:"廃止"},manufacturer:"メーカー旧"}),
      data:{manufacturer:"メーカー新"},
    }),
    expect.objectContaining({where:expect.objectContaining({unit:"個"}),data:{unit:"本"}}),
    expect.objectContaining({where:expect.objectContaining({majorCategory:"食品"}),data:{majorCategory:"日用品"}}),
    expect.objectContaining({where:expect.objectContaining({minorCategory:"飲料"}),data:{minorCategory:"洗剤"}}),
  ]));
  // Quantity, lot, location and historical tables are not updated by shared metadata edits.
  expect(updates.every(update=>Object.keys(update.data).every(field=>["manufacturer","unit","majorCategory","minorCategory"].includes(field)))).toBe(true);
});

it("keeps stock-specific overrides and historical values untouched",async()=>{
  const {tx,stock}=mockTx();
  await syncItemLinks(tx,"item",{
    manufacturer:"旧",majorCategory:"飲料",minorCategory:"お茶",defaultUnit:"個",
  },{
    manufacturer:"新",majorCategory:"飲料",minorCategory:"お茶",defaultUnit:"個",
  });
  expect(stock).toHaveBeenCalledTimes(1);
  const update=stock.mock.calls[0][0];
  expect(update.where).toMatchObject({itemId:"item",status:{not:"廃止"},manufacturer:"旧"});
  expect(update.where).not.toHaveProperty("OR");
});

it("null stock classifications still inherit the latest item master at read time",()=>{
  expect(inventoryCategoryWhere("majorCategory","食品")).toEqual({
    OR:[{majorCategory:"食品"},{majorCategory:null,item:{is:{majorCategory:"食品"}}}],
  });
});

it("does not overwrite any stocks for unchanged shared metadata",async()=>{
  const {tx,stock,classification}=mockTx();
  const values={manufacturer:"A",majorCategory:"食品",minorCategory:"菓子",defaultUnit:"個"};
  await syncItemLinks(tx,"item",values,values);
  expect(stock).not.toHaveBeenCalled();
  expect(classification).not.toHaveBeenCalled();
});
