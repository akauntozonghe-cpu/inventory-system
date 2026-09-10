"use client";
import type { ReactNode } from "react";
import FeedbackToast from "./FeedbackToast";
type Props={open:boolean;code:string;title:string;event:string;message:string;retrying?:boolean;onRetry:()=>void;onInstantSave?:()=>void;errorReportId?:string;sessionId?:string;onAdminAuthenticate?:(username:string,password:string)=>Promise<{success:boolean;message?:string}>;adminContent?:ReactNode};
export default function SystemErrorDialog({open,code,title,message,onRetry,retrying}:Props){return open?<FeedbackToast tone="error" title={title} errorCode={code} message={message} onRetry={onRetry} retrying={retrying}/>:null;}
