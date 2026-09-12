import sharp from "sharp";
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 4_000_000;
export async function prepareItemPhoto(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new Error("写真は4MB以内にしてください。");
  const image = sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("JPEG・PNG・WebPの静止画を選んでください。");
  const data = await image.rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({quality:78}).toBuffer();
  const thumbnail = await sharp(data).resize(240,240,{fit:"inside",withoutEnlargement:true}).webp({quality:70}).toBuffer();
  return {data:new Uint8Array(data),thumbnail:new Uint8Array(thumbnail)};
}
