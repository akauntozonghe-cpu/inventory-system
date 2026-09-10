"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {usePathname} from "next/navigation";
import {useLiveRefresh} from "@/hooks/useLiveRefresh";
import {publicPage} from "@/lib/page-flow";
type CameraState = PermissionState | "unknown" | "unsupported";
const Context=createContext({loaded:false,cameraRequired:true,canManage:false,camera:"unknown" as CameraState,notification:"unknown",deferred:false,error:"",defer:()=>{},refresh:async()=>{},requestCamera:async()=>{}});
export const useDevicePermissions=()=>useContext(Context);
export default function PermissionProvider({children}:{children:ReactNode}){
  const pathname=usePathname(),[settings,setSettings]=useState({loaded:false,cameraRequired:true,canManage:false,sessionKey:""});
  const [camera,setCamera]=useState<CameraState>("unknown"),[notification,setNotification]=useState("unknown"),[deferred,setDeferred]=useState(false),[error,setError]=useState("");
  const cameraConfirmed=useRef(false),generation=useRef(0);
  const invalidate=useCallback(()=>{generation.current++;},[]);
  const refresh=useCallback(async()=>{
    const version=++generation.current;
    if(publicPage(pathname)){setSettings(s=>({...s,loaded:false}));setDeferred(false);cameraConfirmed.current=false;return;}
    try{
      const response=await fetch("/api/device/permissions",{cache:"no-store",signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error("PERMISSION_STATUS_FAILED：使用許可の設定を確認できません。通信が戻ったら再確認してください。");
      const value=await response.json();if(version!==generation.current)return;
      setSettings({...value,loaded:true});
      try{setDeferred(sessionStorage.getItem("inventory:permissions-deferred")===value.sessionKey);}catch{setDeferred(false);}
      setError("");
    }catch(error){if(version===generation.current)setError(error instanceof Error?error.message:"PERMISSION_STATUS_FAILED：設定を確認できません。");}
  },[pathname]);
  useLiveRefresh(refresh,!publicPage(pathname));
  useEffect(()=>{void refresh();const wake=()=>{if(document.visibilityState==="visible")void refresh();};window.addEventListener("focus",wake);document.addEventListener("visibilitychange",wake);window.addEventListener("inventory:permission-policy",wake);return()=>{invalidate();window.removeEventListener("focus",wake);document.removeEventListener("visibilitychange",wake);window.removeEventListener("inventory:permission-policy",wake);};},[refresh,invalidate]);
  useEffect(()=>{
    let active=true;const statuses:PermissionStatus[]=[];
    const inspect=async()=>{
      setNotification("Notification" in window?Notification.permission:"unsupported");
      if(!navigator.mediaDevices?.getUserMedia){setCamera("unsupported");return;}
      try{const status=await navigator.permissions.query({name:"camera" as PermissionName});if(active)setCamera(status.state);}
      catch{if(active)setCamera(cameraConfirmed.current?"granted":"unknown");}
    };
    void inspect();
    for(const name of ["camera","notifications"])void navigator.permissions?.query({name:name as PermissionName}).then(status=>{if(!active)return;status.addEventListener("change",inspect);statuses.push(status);}).catch(()=>{});
    const cameraAccepted=()=>{cameraConfirmed.current=true;setCamera("granted");};
    window.addEventListener("inventory:camera-granted",cameraAccepted);window.addEventListener("inventory:permission",inspect);window.addEventListener("focus",inspect);
    return()=>{active=false;statuses.forEach(status=>status.removeEventListener("change",inspect));window.removeEventListener("inventory:camera-granted",cameraAccepted);window.removeEventListener("inventory:permission",inspect);window.removeEventListener("focus",inspect);};
  },[pathname]);
  const requestCamera=async()=>{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error("CAMERA_UNAVAILABLE：カメラを使える端末・HTTPSで開いてください。使わない場合は管理者に必須解除を依頼してください。");
    try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});stream.getTracks().forEach(track=>track.stop());window.dispatchEvent(new Event("inventory:camera-granted"));window.dispatchEvent(new Event("inventory:permission"));}
    catch(error){if(error instanceof Error&&error.name==="NotAllowedError"){setCamera("denied");throw new Error("CAMERA_PERMISSION：カメラを許可してください。ブロック済みの場合はブラウザのサイト設定でカメラを許可してから再確認してください。");}throw error;}
  };
  const defer=()=>{setDeferred(true);try{sessionStorage.setItem("inventory:permissions-deferred",settings.sessionKey);}catch{}};
  return <Context.Provider value={{...settings,camera,notification,deferred,error,refresh,requestCamera,defer}}>{children}</Context.Provider>;
}
