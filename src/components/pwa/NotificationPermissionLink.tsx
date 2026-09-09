"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
export default function NotificationPermissionLink(){
  const [label,setLabel]=useState("通知・使用許可");
  useEffect(()=>{const read=()=>setLabel(!("Notification" in window)?"通知・使用許可":Notification.permission==="granted"?"通知の許可済み":Notification.permission==="denied"?"通知はブロック中":"通知は未許可");read();window.addEventListener("focus",read);window.addEventListener("inventory:permission",read);return()=>{window.removeEventListener("focus",read);window.removeEventListener("inventory:permission",read);};},[]);
  return <Link className="inline-flex min-h-11 items-center rounded-lg px-2 underline" href="/notifications#device-permissions">{label}</Link>;
}
