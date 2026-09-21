const key="inventoryHistoryIndex";
export function requestBack(fallback:string){window.dispatchEvent(new CustomEvent("inventory:back",{detail:{fallback}}));}
export function canGoBack(){return typeof history.state?.[key]==="number"&&history.state[key]>0;}
export function installNavigationHistory(options:{isDirty:()=>boolean;onLeave:()=>void}){
  const originalPush=history.pushState,originalReplace=history.replaceState;
  let current=typeof history.state?.[key]==="number"?history.state[key]:0;
  let restoring=false;
  originalReplace.call(history,{...history.state,[key]:current},"",location.href);
  const push:History["pushState"]=function(data,title,url){const next=current+1;originalPush.call(history,{...data,[key]:next},title,url);current=next;};
  const replace:History["replaceState"]=function(data,title,url){originalReplace.call(history,{...data,[key]:current},title,url);};
  history.pushState=push;history.replaceState=replace;
  const pop=(event:PopStateEvent)=>{
    const next=typeof event.state?.[key]==="number"?event.state[key]:0;
    if(restoring){restoring=false;event.stopImmediatePropagation();return;}
    if(options.isDirty()&&!window.confirm("保存していない入力があります。保存せずに前後の画面へ移動しますか？")){
      event.stopImmediatePropagation();restoring=true;history.go(current-next || 1);return;
    }
    current=next;options.onLeave();
  };
  window.addEventListener("popstate",pop,true);
  return()=>{window.removeEventListener("popstate",pop,true);if(history.pushState===push)history.pushState=originalPush;if(history.replaceState===replace)history.replaceState=originalReplace;};
}
