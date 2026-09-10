import {expect,it} from "vitest";
import {canViewNotification,notificationDestination} from "../src/lib/notification-destination";
import {notificationReturnPath} from "../src/lib/page-flow";
const worker={id:"worker",role:"WORKER",featurePermissions:["STOCKTAKE","CATALOG"]};
it("keeps another user's notification private, even from an administrator",()=>{
 expect(canViewNotification({type:"OTHER",audience:"USER",recipientUserId:"other"},{id:"admin",role:"ADMIN"})).toBe(false);
 expect(canViewNotification({type:"OTHER",audience:"ADMIN"},worker)).toBe(false);
 expect(canViewNotification({type:"OTHER",recipientUserId:"worker"},worker)).toBe(true);
});
it("does not expose administrator recovery through an ordinary notification",()=>{
 expect(notificationDestination({type:"SYSTEM_ERROR",detail:{route:"/admin/system-check"}},worker)).toBeNull();
 expect(notificationDestination({type:"SYSTEM_ERROR",detail:{systemCheckRunId:"run"}},{id:"admin",role:"ADMIN"})?.href).toBe("/admin/system-check");
});
it("opens the specific sale and stocktake instead of a generic home page",()=>{
 expect(notificationDestination({type:"MARKETPLACE_SOLD",detail:{marketplaceListingId:"sale-1"}},worker)?.href).toBe("/marketplace?listingId=sale-1");
 expect(notificationDestination({type:"OTHER",stocktakeSessionId:"session-1"},worker)?.href).toBe("/stocktake/session-1/result");
 expect(notificationDestination({type:"OTHER",stocktakeSessionId:"session-1"},{...worker,featurePermissions:[]})).toBeNull();
});
it("ignores untrusted links and accepts only notification details after login",()=>{
 for(const path of ["https://evil.test","//evil.test","/admin/system-check","/notifications/../admin","/notifications/a?redirect=evil"]){expect(notificationReturnPath(path)).toBe("/");}
 expect(notificationReturnPath("/notifications/n-1")).toBe("/notifications/n-1");
 expect(notificationDestination({type:"OTHER",detail:{itemId:"../admin",route:"https://evil.test"}},worker)).toBeNull();
});
