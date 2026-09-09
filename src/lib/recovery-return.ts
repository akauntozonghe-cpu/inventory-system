export const RECOVERY_RETURN_KEY="inventory:recovery-return";
export type RecoveryReturn={route:string;reportId:string};
export function readRecoveryReturn():RecoveryReturn|null {
  try{const value=JSON.parse(sessionStorage.getItem(RECOVERY_RETURN_KEY)??"null");return value&&typeof value.route==="string"&&value.route.startsWith("/")&&!value.route.startsWith("//")&&typeof value.reportId==="string"?value:null;}catch{return null;}
}
export function rememberRecoveryReturn(value:RecoveryReturn|null){try{if(value)sessionStorage.setItem(RECOVERY_RETURN_KEY,JSON.stringify(value));else sessionStorage.removeItem(RECOVERY_RETURN_KEY);}catch{}window.dispatchEvent(new Event("inventory:recovery-return-changed"));}
