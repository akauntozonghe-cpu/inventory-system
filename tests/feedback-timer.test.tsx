import {beforeEach,afterEach,expect,it,vi} from "vitest";
// Run effect lifecycles across rerenders without depending on a browser DOM.
const hooks=vi.hoisted(()=>({index:0,slots:[] as Array<{deps?:unknown[];cleanup?:()=>void;current?:unknown}>}));
vi.mock("react",async importOriginal=>({...await importOriginal<object>(),
  useRef:(value:unknown)=>hooks.slots[hooks.index++]??(hooks.slots[hooks.index-1]={current:value}),
  useEffect:(effect:()=>void|(()=>void),deps:unknown[])=>{
    const index=hooks.index++,previous=hooks.slots[index];
    if(previous?.deps?.every((value,i)=>Object.is(value,deps[i])))return;
    previous?.cleanup?.();const cleanup=effect();hooks.slots[index]={deps,cleanup:cleanup||undefined};
  },
}));
import FeedbackToast from "../src/components/common/FeedbackToast";
function render(message:string,onClose:()=>void){hooks.index=0;FeedbackToast({message,tone:"success",onClose});}
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal("window",globalThis);hooks.slots=[];hooks.index=0;});
afterEach(()=>{hooks.slots.forEach(slot=>slot.cleanup?.());vi.useRealTimers();vi.unstubAllGlobals();});
it("expires on time despite one-second live refresh rerenders",()=>{
  const closed=vi.fn();render("保存しました",closed);
  for(let i=0;i<3;i++){vi.advanceTimersByTime(1000);render("保存しました",()=>closed());}
  expect(closed).not.toHaveBeenCalled();vi.advanceTimersByTime(500);expect(closed).toHaveBeenCalledOnce();
});
it("gives a new message its own full display time",()=>{
  const closed=vi.fn();render("読取完了",closed);vi.advanceTimersByTime(3000);render("保存しました",closed);
  vi.advanceTimersByTime(1000);expect(closed).not.toHaveBeenCalled();vi.advanceTimersByTime(2500);expect(closed).toHaveBeenCalledOnce();
});
