import { AUTH_COOKIE, ADMIN_ELEVATION_COOKIE, verifySessionToken, verifyAdminElevationToken } from "./auth";
export type OperationAccess = { mode:"STANDARD_ADMIN"|"TEMPORARY_ADMIN"|"STANDARD_USER"|"UNKNOWN"; actorId?:string; actorName?:string; authorizedById?:string; authorizedByName?:string; expiresAt?:number };
export function operationAccess(session?:string,elevationToken?:string):OperationAccess {
  const user=verifySessionToken(session);if(!user)return {mode:"UNKNOWN"};
  const actor={actorId:user.id,actorName:user.displayName};
  if(user.role==="ADMIN")return {...actor,mode:"STANDARD_ADMIN"};
  const elevation=verifyAdminElevationToken(elevationToken);
  if(elevation?.authenticatedByUserId===user.id)return {...actor,mode:"TEMPORARY_ADMIN",authorizedById:elevation.adminUserId,...(elevation.adminDisplayName?{authorizedByName:elevation.adminDisplayName}:{}),expiresAt:elevation.expiresAt};
  return {...actor,mode:"STANDARD_USER"};
}
export async function currentOperationAccess():Promise<OperationAccess> {
  try { const {cookies}=await import("next/headers");const jar=await cookies();return operationAccess(jar.get(AUTH_COOKIE)?.value,jar.get(ADMIN_ELEVATION_COOKIE)?.value); }
  catch { return {mode:"UNKNOWN"}; }
}
