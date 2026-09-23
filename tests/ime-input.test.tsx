import { beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
const hooks=vi.hoisted(()=>({index:0,slots:[] as Array<{current:unknown}>,effects:[] as Array<()=>void>}));
vi.mock("react",async original=>({...await original<object>(),
  useRef:(value:unknown)=>hooks.slots[hooks.index++]??(hooks.slots[hooks.index-1]={current:value}),
  useLayoutEffect:(effect:()=>void)=>hooks.effects.push(effect),
}));
import ImeInput from "../src/components/common/ImeInput";
beforeEach(()=>{hooks.index=0;hooks.slots=[];hooks.effects=[];});
function render(props:ComponentProps<typeof ImeInput>){hooks.index=0;hooks.effects=[];return ImeInput(props);}
it("preserves Japanese composition through live rerenders and publishes only the final text",()=>{
  const changed=vi.fn();const node={value:""};
  let view=render({value:"",onChange:changed,type:"search"});
  view.props.ref(node);
  view.props.onCompositionStart({currentTarget:node,target:node});
  for(const value of ["ろ","ろき","ろきそ","ろきそに","ろきそにん"]){
    node.value=value;
    view.props.onChange({currentTarget:node,target:node,nativeEvent:{isComposing:true}});
    view=render({value:"",onChange:changed,type:"search"});
    hooks.effects.forEach(effect=>effect());
    expect(node.value).toBe(value);
  }
  expect(changed).not.toHaveBeenCalled();
  node.value="ロキソニン";
  view.props.onCompositionEnd({currentTarget:node,target:node});
  expect(changed).toHaveBeenCalledOnce();
  expect(changed.mock.calls[0][0].target.value).toBe("ロキソニン");
  render({value:"ロキソニン",onChange:changed});hooks.effects.forEach(effect=>effect());
  expect(node.value).toBe("ロキソニン");
});
it("applies external clears after composition and keeps normal input responsive",()=>{
  const node={value:"ロキソニン"};const changed=vi.fn();
  const view=render({value:"ロキソニン",onChange:changed});view.props.ref(node);
  node.value="ロキソニンS";view.props.onChange({target:node,nativeEvent:{isComposing:false}});
  expect(changed).toHaveBeenCalledOnce();
  render({value:"",onChange:changed});hooks.effects.forEach(effect=>effect());expect(node.value).toBe("");
});
it("retains native controlled behavior for checkbox and number inputs",()=>{
  const changed=vi.fn();
  expect(render({type:"checkbox",checked:true,onChange:changed}).props).toMatchObject({checked:true,onChange:changed});
  expect(render({type:"number",value:0,onChange:changed}).props).toMatchObject({value:0,onChange:changed});
});
it("does not submit a search on the Enter key used to confirm Japanese conversion",()=>{
  const key=vi.fn();const view=render({value:"",onKeyDown:key});
  const event={key:"Enter",nativeEvent:{isComposing:true},preventDefault:vi.fn(),stopPropagation:vi.fn()};
  view.props.onKeyDown(event);expect(key).not.toHaveBeenCalled();expect(event.preventDefault).toHaveBeenCalledOnce();
  view.props.onKeyDown({...event,nativeEvent:{isComposing:false}});expect(key).toHaveBeenCalledOnce();
});
