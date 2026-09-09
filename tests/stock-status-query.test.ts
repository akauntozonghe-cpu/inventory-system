import {it,expect,vi} from "vitest";
const db=vi.hoisted(()=>({item:{findMany:vi.fn()},$transaction:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
import {ItemRepository} from "../src/repositories/ItemRepository";
it("reads quantities and linked marketplace states from the same snapshot",async()=>{const rows=[{id:"p1",inventoryInstances:[{quantity:7,marketplaceListings:[{status:"SOLD",soldQuantity:3}]}]}];db.item.findMany.mockResolvedValue(rows);db.$transaction.mockImplementation(async fn=>fn(db));expect(await ItemRepository.findAll()).toEqual(rows);expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:"RepeatableRead"});const select=db.item.findMany.mock.calls[0][0].include.inventoryInstances.select;expect(select.quantity).toBe(true);expect(select.marketplaceListings.select).toEqual({id:true,status:true,shippingStatus:true,listedQuantity:true,soldQuantity:true});expect(select.marketplaceListings.select.price).toBeUndefined();});
