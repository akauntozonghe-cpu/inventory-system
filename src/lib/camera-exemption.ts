import {createHmac,timingSafeEqual} from "node:crypto";
export const CAMERA_EXEMPTION_COOKIE = "inventory_camera_exemption";
export const CAMERA_EXEMPTION_SECONDS = 365 * 86400;
function signature(value:string){
  const secret=process.env.AUTH_SECRET;
  if(!secret || secret.length<32)throw new Error("PERMISSION_SECRET_MISSING");
  return createHmac("sha256",secret).update("camera-exemption:"+value).digest("base64url");
}
export function createCameraExemption(adminUserId:string,now=Date.now()){
  const value=Buffer.from(JSON.stringify({adminUserId,expiresAt:now+CAMERA_EXEMPTION_SECONDS*1000})).toString("base64url");
  return value+"."+signature(value);
}
export function hasCameraExemption(token:string|undefined,now=Date.now()){
  if(!token || token.length>2048)return false;
  try{
    const [value,signed,...rest]=token.split(".");if(!value||!signed||rest.length)return false;
    const expected=Buffer.from(signature(value)),actual=Buffer.from(signed);
    if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return false;
    const payload=JSON.parse(Buffer.from(value,"base64url").toString("utf8"));
    return typeof payload.adminUserId==="string"&&payload.adminUserId.length>0&&Number.isFinite(payload.expiresAt)&&payload.expiresAt>now;
  }catch{return false;}
}
