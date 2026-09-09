import {expect,it} from "vitest";
import {visibleAppMenu} from "../src/lib/app-menu";
it("only shows granted work features and hides protected admin destinations",()=>{const links=visibleAppMenu({role:"USER",featurePermissions:["CATALOG"]}).flatMap(g=>g.links.map(l=>l.href));expect(links).toContain("/items");expect(links).not.toContain("/admin");expect(links).not.toContain("/stocktake/start");});
it("lets administrators reach all work and configuration menus",()=>{const links=visibleAppMenu({role:"ADMIN"}).flatMap(g=>g.links.map(l=>l.href));expect(links).toContain("/admin");expect(links).toContain("/stocktake/start");expect(new Set(links).size).toBe(links.length);});
