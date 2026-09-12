import {expect,it} from "vitest";
import sharp from "sharp";
import {prepareItemPhoto} from "../src/lib/item-photo";
import {generateSystemJan} from "../src/lib/system-jan";
import {validJan} from "../src/lib/zaico-import";
it("stores resized images and small thumbnails without source metadata",async()=>{
  const source=await sharp({create:{width:2000,height:1000,channels:3,background:"red"}}).jpeg().withMetadata().toBuffer();
  const {data,thumbnail}=await prepareItemPhoto(source),main=await sharp(data).metadata(),thumb=await sharp(thumbnail).metadata();
  expect(main).toMatchObject({format:"webp",width:1600,height:800});expect(main.exif).toBeUndefined();expect(thumb.width).toBe(240);
});
it("rejects SVG, invalid and oversized uploads",async()=>{
  await expect(prepareItemPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'))).rejects.toThrow();
  await expect(prepareItemPhoto(Buffer.from('not an image'))).rejects.toThrow();
  await expect(prepareItemPhoto(new Uint8Array(4_000_001))).rejects.toThrow();
});
it("generates check-digit-valid internal JANs",()=>{for(let i=0;i<100;i++){const code=generateSystemJan();expect(code).toMatch(/^20\d{11}$/);expect(validJan(code)).toBe(true);}});
