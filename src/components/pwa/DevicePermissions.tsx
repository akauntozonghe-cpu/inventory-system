"use client";
import {useState} from "react";
export default function DevicePermissions(){
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  async function camera(){
    setBusy(true);
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("この環境ではカメラを利用できません。HTTPSで開いてください。");
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
      stream.getTracks().forEach(track=>track.stop());setMessage("カメラを使用できます。確認用カメラは停止しました。");
    }catch(error){setMessage(error instanceof Error&&error.name==="NotAllowedError"?"CAMERA_PERMISSION：カメラが許可されていません。ブラウザのサイト設定で変更できます。":`CAMERA_UNAVAILABLE：${error instanceof Error?error.message:"カメラを確認できませんでした。"}`);}
    finally{setBusy(false);}
  }
  return <div className="mt-4 border-t pt-3"><h3 className="font-bold">カメラの使用許可</h3><p className="my-2 text-sm">JAN・QRの読み取りに使います。読み取り開始時、または下の確認ボタンを押した時に許可を求めます。マイク・位置情報は使いません。</p><button disabled={busy} onClick={()=>void camera()} className="rounded-xl border p-3 font-bold">{busy?"確認中…":"カメラを許可して確認"}</button>{message&&<p role="status" className="mt-2 text-sm">{message}</p>}</div>;
}
