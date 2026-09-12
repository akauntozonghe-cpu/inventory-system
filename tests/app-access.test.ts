import {expect,it} from "vitest";
import {canUseFeature,canVisit} from "../src/lib/app-access";
import {visibleAppMenu} from "../src/lib/app-menu";
const user={id:"u",displayName:"作業者",role:"WORKER",featurePermissions:["CATALOG","MARKETPLACE_SETTINGS"]};
it("uses the same permissions for headers and page links",()=>{
  expect(canVisit(user,"/items/id?inventoryId=one")).toBe(true);
  for(const path of ["/expiry","/stocktake/history","/admin","/import","/add","/marketplace","/admin/marketplace/settings"])expect(canVisit(user,path)).toBe(false);
  expect(visibleAppMenu(user).flatMap(g=>g.links).some(l=>l.href==="/admin/marketplace/settings")).toBe(false);
  expect(canUseFeature(user,"LABEL_PRINT")).toBe(false);
});
it("hides operations until permissions are loaded and permits admins",()=>{
  expect(canVisit(null,"/items")).toBe(false);expect(canUseFeature(null,"LABEL_PRINT")).toBe(false);
  expect(canVisit({...user,role:"ADMIN"},"/import")).toBe(true);
  expect(canUseFeature({...user,role:"ADMIN"},"LABEL_PRINT")).toBe(true);
});
