"use client";
import {useEffect} from "react";
export default function NotificationReadMarker({id}:{id:string}){
 useEffect(()=>{void fetch("/api/notifications",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({notificationIds:[id]})}).then(response=>{if(response.ok)window.dispatchEvent(new Event("inventory:notifications-read"));}).catch(()=>{});},[id]);return null;
}
