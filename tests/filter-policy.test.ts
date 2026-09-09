import {expect,it} from "vitest";
import {nextClassification} from "../src/lib/classification-change";
import {defaultPushPolicy,pushMessage,readPushPolicy,validPushPolicy} from "../src/lib/device-notification-policy";
import {validCronAuthorization} from "../src/lib/cron-auth";
it("preserves minor name only when major-only mode is explicit",()=>{
 const before={majorCategory:"食品",minorCategory:"飲料"};
 expect(nextClassification(before,{majorCategory:"備品",keepMinorCategory:true})).toEqual({majorCategory:"備品",minorCategory:"飲料"});
 expect(nextClassification(before,{majorCategory:"備品"})).toEqual({majorCategory:"備品",minorCategory:null});
 expect(nextClassification(before,{minorCategory:null})).toEqual({majorCategory:"食品",minorCategory:null});
 expect(nextClassification(before,{majorCategory:null,keepMinorCategory:true})).toEqual({majorCategory:null,minorCategory:null});
});
it("accepts only known notification types, booleans and supported retention",()=>{
 expect(readPushPolicy({})).toEqual(defaultPushPolicy);
 expect(validPushPolicy({...defaultPushPolicy,enabled:"true"})).toBe(false);
 expect(validPushPolicy({...defaultPushPolicy,types:["SYSTEM_ERROR","SYSTEM_ERROR"]})).toBe(false);
 expect(validPushPolicy({...defaultPushPolicy,types:["ALL_USERS"]})).toBe(false);
 expect(validPushPolicy({...defaultPushPolicy,ttl:0})).toBe(false);
 expect(validPushPolicy({...defaultPushPolicy,types:[]})).toBe(true);
});
it("requires explicit admin policy to disclose business details",()=>{
 const note={title:"商品A",message:"売却済み"};
 expect(JSON.stringify(pushMessage(defaultPushPolicy,note))).not.toContain("商品A");
 expect(pushMessage({...defaultPushPolicy,showDetails:true},note).body).toBe("売却済み");
 expect(pushMessage({...defaultPushPolicy,showDetails:true},note,true).title).toBe("Inventory OS");
});
it("rejects unauthenticated scheduler requests including missing server configuration",()=>{
 const secret="a".repeat(32);
 expect(validCronAuthorization(null,secret)).toBe(false);
 expect(validCronAuthorization("Bearer undefined",undefined)).toBe(false);
 expect(validCronAuthorization("Bearer short","short")).toBe(false);
 expect(validCronAuthorization("Bearer "+"b".repeat(32),secret)).toBe(false);
 expect(validCronAuthorization("Bearer "+secret,secret)).toBe(true);
});
