"use client";
import {useState} from "react";
import {useDevicePermissions} from "./PermissionProvider";
import AdminModeDialog from "@/components/stocktake/AdminModeDialog";
import Modal from "@/components/common/Modal";
export default function DevicePermissions({compact=false}:{compact?:boolean}){
  const permissions=useDevicePermissions();
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),[authOpen,setAuthOpen]=useState(false),[target,setTarget]=useState<boolean|null>(null);
  const camera=async()=>{setBusy(true);setMessage("");try{await permissions.requestCamera();setMessage("カメラを使用できます。確認用カメラは停止しました。");}catch(error){setMessage(error instanceof Error?error.message:"CAMERA_UNAVAILABLE：カメラを確認できませんでした。");}finally{setBusy(false);}};
  const manage=()=>{setMessage("");if(permissions.canManage)setTarget(!permissions.cameraRequired);else setAuthOpen(true);};
  const save=async()=>{
    setBusy(true);setMessage("");try{
      const response=await fetch("/api/device/permissions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cameraRequired:target}),signal:AbortSignal.timeout(10000)});
      const value=await response.json();if(!response.ok)throw new Error(`${value.code}：${value.message}`);
      setTarget(null);setMessage(value.message);window.dispatchEvent(new Event("inventory:permission-policy"));await permissions.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"PERMISSION_SAVE_FAILED：設定できませんでした。");}finally{setBusy(false);}
  };
  return <div className={compact?"space-y-2":"mt-4 space-y-3 border-t pt-3"}>
    <h3 className="font-bold">カメラ：{!permissions.loaded?"設定を確認中":permissions.cameraRequired?"必須":"管理者による必須解除済み"} ／ {permissions.camera==="granted"?"許可済み":permissions.camera==="denied"?"ブロック中":"未許可・未確認"}</h3>
    {permissions.cameraRequired&&permissions.camera!=="granted"&&<p className="text-sm">JAN・QRの読み取りに必要です。カメラを許可してください。「後回し」にしても必須の状態は続きます。</p>}
    {permissions.camera==="denied"&&<p className="text-sm">ブラウザのサイト設定でカメラを「許可」に変更してから再確認してください。</p>}
    {!compact&&<p className="text-sm">カメラを使わない運用は、管理者認証のうえ、この端末のブラウザだけ必須を解除できます。マイク・位置情報は使いません。</p>}
    <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void camera()} className="rounded-xl bg-blue-700 p-3 font-bold text-white">{busy?"処理中…":permissions.camera==="granted"?"カメラを再確認":"カメラを許可して確認"}</button><button disabled={busy||!permissions.loaded} onClick={manage} className="rounded-xl border p-3 font-bold">{permissions.cameraRequired?"管理者：カメラ必須を解除":"管理者：カメラを必須に戻す"}</button></div>
    {message&&<p role="status" className="text-sm">{message}</p>}
    <AdminModeDialog open={authOpen} sessionId="" purpose="この端末のカメラ必須設定を変更します。ほかの端末には影響しません。" onClose={()=>setAuthOpen(false)} onAuthenticated={()=>{setAuthOpen(false);setTarget(!permissions.cameraRequired);void permissions.refresh();}}/>
    {target!==null&&<Modal titleId="camera-policy-confirm" busy={busy} onClose={()=>setTarget(null)}><h2 id="camera-policy-confirm" className="text-xl font-bold">{target?"カメラを必須に戻しますか？":"この端末のカメラ必須を解除しますか？"}</h2><p className="my-3">{target?"未許可の場合、カメラの許可が必要な状態に戻ります。":"このブラウザではカメラを使わず、商品検索・手入力で作業できます。他の端末は必須のままです。ブラウザ自体のカメラ許可は変更しません。"}</p>{message&&<p role="alert" className="my-2 text-red-700">{message}</p>}<div className="flex gap-2"><button disabled={busy} className="rounded-xl bg-slate-800 p-3 font-bold text-white" onClick={()=>void save()}>{target?"必須に戻す":"この端末だけ解除"}</button><button disabled={busy} className="rounded-xl border p-3" onClick={()=>setTarget(null)}>戻る</button></div></Modal>}
  </div>;
}
