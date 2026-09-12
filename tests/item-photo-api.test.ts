import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";
const mocks=vi.hoisted(()=>({admin:vi.fn(),login:vi.fn(),prepare:vi.fn(),db:{$transaction:vi.fn(),$queryRaw:vi.fn(),itemPhoto:{findMany:vi.fn(),count:vi.fn(),create:vi.fn(),findFirst:vi.fn(),deleteMany:vi.fn()},adminActionLog:{create:vi.fn()}}}));
vi.mock("@/lib/auth",()=>({requireAdmin:mocks.admin,requireLogin:mocks.login}));vi.mock("@/lib/prisma",()=>({prisma:mocks.db}));vi.mock("@/lib/item-photo",()=>({MAX_PHOTOS:5,MAX_PHOTO_BYTES:4_000_000,prepareItemPhoto:mocks.prepare}));
import {POST} from "../src/app/api/items/[id]/photos/route";
import {GET,DELETE} from "../src/app/api/items/[id]/photos/[photoId]/route";
const params={params:Promise.resolve({id:"item",photoId:"photo"})};
beforeEach(()=>{vi.resetAllMocks();mocks.admin.mockReturnValue({user:{id:"admin"}});mocks.login.mockReturnValue({user:{id:"user"}});mocks.db.$transaction.mockImplementation(fn=>fn(mocks.db));mocks.db.$queryRaw.mockResolvedValue([{id:"item"}]);mocks.db.itemPhoto.findMany.mockResolvedValue([]);mocks.db.itemPhoto.count.mockResolvedValue(0);mocks.db.itemPhoto.create.mockResolvedValue({id:"photo"});mocks.prepare.mockResolvedValue({data:new Uint8Array([1]),thumbnail:new Uint8Array([2])});});
it("rejects writes without edit rights before reading or saving images",async()=>{
  mocks.admin.mockReturnValue({response:NextResponse.json({message:"denied"},{status:403})});
  expect((await POST(new NextRequest("http://local/api/items/item/photos",{method:"POST",body:"image"}),params)).status).toBe(403);
  expect((await DELETE(new NextRequest("http://local/api/items/item/photos/photo",{method:"DELETE"}),params)).status).toBe(403);
  expect(mocks.prepare).not.toHaveBeenCalled();expect(mocks.db.$transaction).not.toHaveBeenCalled();
});
it("enforces the five-photo limit under a product lock",async()=>{
  mocks.db.itemPhoto.count.mockResolvedValue(5);
  const response=await POST(new NextRequest("http://local/api/items/item/photos",{method:"POST",body:"image"}),params);
  expect(response.status).toBe(409);expect(mocks.db.$queryRaw).toHaveBeenCalledOnce();expect(mocks.db.itemPhoto.create).not.toHaveBeenCalled();
});
it("saves processed photos and an audit entry atomically",async()=>{
  expect((await POST(new NextRequest("http://local/api/items/item/photos",{method:"POST",body:"image"}),params)).status).toBe(201);
  expect(mocks.db.itemPhoto.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({itemId:"item"})}));expect(mocks.db.adminActionLog.create).toHaveBeenCalledOnce();
});
it("does not serve a photo belonging to a different product",async()=>{
  mocks.db.itemPhoto.findFirst.mockResolvedValue(null);
  expect((await GET(new NextRequest("http://local/api/items/item/photos/photo?thumbnail=1"),params)).status).toBe(404);
  expect(mocks.db.itemPhoto.findFirst).toHaveBeenCalledWith({where:{id:"photo",itemId:"item"},select:{thumbnail:true}});
});
it("serves authenticated images without public caching",async()=>{
  mocks.db.itemPhoto.findFirst.mockResolvedValue({data:new Uint8Array([1,2])});
  const response=await GET(new NextRequest("http://local/api/items/item/photos/photo"),params);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("content-type")).toBe("image/webp");
});

it("repeated photo imports reuse the existing image even when five slots are full",async()=>{
mocks.db.itemPhoto.findMany.mockResolvedValue([{id:"same-photo",data:new Uint8Array([1]),createdAt:new Date()}]);mocks.db.itemPhoto.count.mockResolvedValue(5);
const response=await POST(new NextRequest("http://local/api/items/item/photos",{method:"POST",body:"image"}),params);
expect(response.status).toBe(201);expect((await response.json()).photo.id).toBe("same-photo");expect(mocks.db.itemPhoto.create).not.toHaveBeenCalled();
});
