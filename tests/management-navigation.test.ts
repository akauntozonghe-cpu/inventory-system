import { describe, expect, it } from "vitest";
import {
  destructiveDestinations,
  filterManagementSections,
  managementDestination,
  managementSections,
  managementShortcuts,
} from "../src/lib/management-navigation";
import { visibleAppMenu } from "../src/lib/app-menu";
import { pageParent, pageTitle } from "../src/lib/page-flow";

describe("management center navigation", () => {
  const destinations = managementSections.flatMap(section => section.destinations);

  it("groups all management destinations without duplicate links", () => {
    expect(managementSections.map(section => section.id)).toEqual(["work", "catalog", "people", "system"]);
    expect(new Set(destinations.map(link => link.href)).size).toBe(destinations.length);
    expect(destinations.every(destination => destination.href.startsWith("/") && destination.title && destination.description)).toBe(true);
  });

  it("keeps data reset outside everyday management", () => {
    expect(destructiveDestinations.map(destination => destination.href)).toEqual(["/reset"]);
    expect(destinations.some(destination => destination.href === "/reset")).toBe(false);
    expect(managementShortcuts.every(path => Boolean(managementDestination(path)))).toBe(true);
  });

  it("searches functions using action names, normalized writing, and keywords", () => {
    expect(filterManagementSections("棚卸").flatMap(section => section.destinations).some(item => item.href === "/admin/stocktake")).toBe(true);
    expect(filterManagementSections("権限").flatMap(section => section.destinations).some(item => item.href === "/admin/users")).toBe(true);
    expect(filterManagementSections("ＣＳＶ").flatMap(section => section.destinations).some(item => item.href === "/import")).toBe(true);
    expect(filterManagementSections("削除").flatMap(section => section.destinations).some(item => item.href === "/items")).toBe(true);
    expect(filterManagementSections("存在しない管理項目")).toEqual([]);
  });

  it("shows admin-only shortcuts only to administrators and keeps their labels consistent", () => {
    const workerLinks = visibleAppMenu({role:"WORKER",featurePermissions:["CATALOG"]}).flatMap(section => section.links);
    expect(workerLinks.some(link => link.href.startsWith("/admin"))).toBe(false);
    expect(workerLinks.some(link => link.href === "/items")).toBe(true);
    const adminLinks = visibleAppMenu({role:"ADMIN"}).flatMap(section => section.links);
    expect(new Set(adminLinks.map(link => link.href)).size).toBe(adminLinks.length);
    expect(adminLinks.find(link => link.href === "/admin")?.label).toContain("管理センター");
  });

  it("returns to the management center from setup and destructive maintenance", () => {
    expect(pageParent("/import").href).toBe("/admin");
    expect(pageParent("/reset").href).toBe("/admin");
    expect(pageParent("/admin/users").href).toBe("/admin");
    expect(pageTitle("/admin")).toBe("管理センター");
    expect(pageTitle("/admin/users")).toBe("利用者・権限");
  });
});
