import {expect,it} from "vitest";
import {pageParent,publicPage} from "../src/lib/page-flow";
import {readItemListQuery,writeItemListQuery} from "../src/lib/item-list-query";
it("uses a parent only as a fallback when there is no recorded previous screen",()=>{expect(pageParent("/stocktake/s").href).toBe("/stocktake/start");expect(pageParent("/items/i").href).toBe("/items");expect(pageParent("/admin/marketplace/settings").href).toBe("/marketplace");});
it("keeps public pages available",()=>{expect(publicPage("/login")).toBe(true);expect(publicPage("/items/i")).toBe(false);});
it("restores all list filters and preserves unrelated query parameters",()=>{const q=readItemListQuery("?q=皿&category=食器&sort=nameAsc&stock=AVAILABLE&today=1&archived=1&registeredDate=2026-09-21");expect(q).toMatchObject({search:"皿",majorCategory:"食器",sort:"nameAsc",stockFilter:"AVAILABLE",todayOnly:true,showArchived:true});expect(readItemListQuery(writeItemListQuery(q,"?source=journal"))).toEqual(q);expect(writeItemListQuery(q,"?source=journal")).toContain("source=journal");});
it("rejects unknown sort/status query values",()=>{expect(readItemListQuery("?sort=bogus&stock=bogus")).toMatchObject({sort:"createdDesc",stockFilter:"ALL"});});
