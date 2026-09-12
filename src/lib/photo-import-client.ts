export async function uploadImportedPhoto(itemId:string, file:Blob) {
  if(file.size>20_000_000)throw new Error("写真は20MB以内にしてください。");
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext("2d")!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",0.85));
  if(!blob)throw new Error("写真を変換できませんでした。");
  const response=await fetch("/api/items/"+encodeURIComponent(itemId)+"/photos",{method:"POST",headers:{"Content-Type":"image/jpeg"},body:blob});
  const result=await response.json();if(!response.ok)throw new Error(result.message||"写真を保存できませんでした。");
}
