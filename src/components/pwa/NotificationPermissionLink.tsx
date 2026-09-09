"use client";
import Link from "next/link";
import {useDevicePermissions} from "./PermissionProvider";
export default function NotificationPermissionLink(){
  const state=useDevicePermissions();
  const camera=state.loaded&&state.cameraRequired&&state.camera!=="granted";
  const label=camera?"カメラ必須・未許可":state.notification==="granted"?"通知の許可済み":state.notification==="denied"?"通知はブロック中":state.notification==="default"?"通知は未許可":"通知・使用許可";
  return <Link className={`inline-flex min-h-11 items-center rounded-lg px-2 underline ${camera?"font-bold text-amber-800":""}`} href="/notifications#device-permissions">{label}</Link>;
}
