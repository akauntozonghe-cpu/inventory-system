"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {publicPage} from "@/lib/page-flow";
import {useDevicePermissions} from "./PermissionProvider";
import DevicePermissions from "./DevicePermissions";
export default function PermissionNotice(){
  const state=useDevicePermissions(),path=usePathname();
  if(publicPage(path)||path==="/account/password"||path==="/notifications")return null;
  if(state.error)return <aside className="m-3 rounded-xl bg-amber-50 p-3 text-sm" role="status">{state.error}<button onClick={()=>void state.refresh()} className="ml-2 min-h-11 underline">再確認</button></aside>;
  const camera=state.cameraRequired&&state.camera!=="granted",notification=["default","denied"].includes(state.notification);
  if(!state.loaded||state.deferred||(!camera&&!notification))return null;
  return <aside aria-label="使用許可のお願い" className="mx-auto my-3 max-w-7xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-slate-950"><div className="mb-3 flex items-start justify-between gap-2"><h2 className="font-bold">使用許可を確認してください</h2><button className="shrink-0 rounded-xl border bg-white p-3 text-sm" onClick={state.defer}>閉じて後回し</button></div>
    {camera&&<DevicePermissions compact/>}
    {notification&&<div className="mt-3 text-sm"><p>アプリを閉じていてもお知らせを受け取れるよう、通知を許可してください。{state.notification==="denied"&&"ブロック中のため、ブラウザのサイト設定で通知を許可してください。"}</p><Link href="/notifications#device-permissions" className="mt-2 inline-flex min-h-11 items-center rounded-xl border bg-white px-3 font-bold">通知の許可設定を開く</Link></div>}
    <p className="mt-3 text-xs">後回しにすると、このログイン中は案内を閉じます。許可状態は画面下部からいつでも確認できます。</p>
  </aside>;
}
