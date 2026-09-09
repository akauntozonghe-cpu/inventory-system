import {expect,it} from "vitest";
import {pageParent,needsEntryRedirect} from "../src/lib/page-flow";
it("uses explicit safe parent routes rather than browser history",()=>{expect(pageParent("/stocktake/s").href).toBe("/stocktake/start");expect(pageParent("/items/i").href).toBe("/items");expect(pageParent("/admin/marketplace/settings").href).toBe("/marketplace");});
it("returns direct deep entries to home while preserving refresh and internal navigation",()=>{expect(needsEntryRedirect("/stocktake/s","navigate","","https://inventory.test")).toBe(true);expect(needsEntryRedirect("/stocktake/s","reload","","https://inventory.test")).toBe(false);expect(needsEntryRedirect("/items","navigate","https://inventory.test/","https://inventory.test")).toBe(false);});
it("allows PWA notification, login and password-reset entry",()=>{for(const route of ["/notifications","/login","/account/password","/"])expect(needsEntryRedirect(route,"navigate","","https://inventory.test")).toBe(false);});
