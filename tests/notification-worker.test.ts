import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {expect,it,vi} from "vitest";
function setup(){
 const events:Record<string,(event:unknown)=>void>={};const focus=vi.fn(),navigate=vi.fn(),openWindow=vi.fn(),showNotification=vi.fn();
 const clients={matchAll:vi.fn(async()=>[{url:"https://inventory.test/stocktake/active",focus,navigate}]),openWindow};
 const self={addEventListener:(name:string,fn:(event:unknown)=>void)=>events[name]=fn,clients,location:{origin:"https://inventory.test"},navigator:{},registration:{showNotification}};
 runInNewContext(readFileSync(new URL("../public/sw.js",import.meta.url),"utf8"),{self,URL});
 return {events,clients,focus,navigate,openWindow,showNotification};
}
it("opens notification details without replacing an unsaved stocktake window",async()=>{const x=setup();let task:Promise<unknown>|undefined;x.events.notificationclick({notification:{close:vi.fn(),data:{url:"/notifications/n-1"}},waitUntil:(p:Promise<unknown>)=>task=p});await task;expect(x.openWindow).toHaveBeenCalledWith("https://inventory.test/notifications/n-1");expect(x.navigate).not.toHaveBeenCalled();});
it("focuses an existing detail window instead of duplicating it",async()=>{const x=setup();x.clients.matchAll.mockResolvedValue([{url:"https://inventory.test/notifications/n-1",focus:x.focus,navigate:x.navigate}]);let task:Promise<unknown>|undefined;x.events.notificationclick({notification:{close:vi.fn(),data:{url:"/notifications/n-1"}},waitUntil:(p:Promise<unknown>)=>task=p});await task;expect(x.focus).toHaveBeenCalledOnce();expect(x.openWindow).not.toHaveBeenCalled();});
it.each(["https://evil.test","/admin/users","/notifications/../admin"])("does not follow arbitrary push destinations: %s",async url=>{const x=setup();let task:Promise<unknown>|undefined;x.events.push({data:{json:()=>({url})},waitUntil:(p:Promise<unknown>)=>task=p});await task;expect(x.showNotification.mock.calls[0][1].data.url).toBe("/notifications");});
