import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {Prisma} from "@prisma/client";
const db=vi.hoisted(()=>({item:{findUnique:vi.fn(),update:vi.fn()}}));
vi.mock("@/lib/prisma",()=>({prisma:db}));vi.mock("@/lib/auth",()=>({requireAdmin:()=>({user:{id:"admin",role:"ADMIN"}})}));vi.mock("@/lib/error-report",()=>({createAdminActionLog:vi.fn()}));
import {POST} from "../src/app/api/items/system-barcode/route";
const request=()=>POST(new NextRequest("http://localhost/api/items/system-barcode",{method:"POST",body:JSON.stringify({itemId:"item"})}));
beforeEach(()=>{vi.resetAllMocks();db.item.findUnique.mockResolvedValue({id:"item",name:"商品",janCode:null,systemBarcode:null});db.item.update.mockResolvedValue({id:"item",name:"商品",systemBarcode:"2001234567893"});});
it("never overwrites another device's assignment after reading an empty code",async()=>{
 db.item.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("changed",{code:"P2025",clientVersion:"6"}));expect((await request()).status).toBe(409);
 expect(db.item.update.mock.calls[0][0].where).toMatchObject({id:"item",AND:[{OR:[{janCode:null},{janCode:""}]},{OR:[{systemBarcode:null},{systemBarcode:""}]}]});
});
it("preserves an existing printed system JAN",async()=>{db.item.findUnique.mockResolvedValue({id:"item",systemBarcode:"2001234567893"});expect((await (await request()).json()).created).toBe(false);expect(db.item.update).not.toHaveBeenCalled();});
it("rejects issuing a system JAN for a product that already has a JAN",async()=>{db.item.findUnique.mockResolvedValue({id:"item",janCode:"4901234567894"});expect((await request()).status).toBe(409);expect(db.item.update).not.toHaveBeenCalled();});
