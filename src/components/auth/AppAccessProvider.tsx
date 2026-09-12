"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchFresh } from "@/lib/fetch-fresh";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { canUseFeature, canVisit, type AppUserAccess } from "@/lib/app-access";
import type { FeatureKey } from "@/lib/feature-permissions";
const Context = createContext<{user: AppUserAccess | null; ready: boolean; refresh: () => Promise<void>}>({user:null,ready:false,refresh:async()=>{}});
export default function AppAccessProvider({children}:{children:React.ReactNode}) {
  const [user,setUser]=useState<AppUserAccess|null>(null),[ready,setReady]=useState(false);
  const sequence=useRef(0),pathname=usePathname();
  const publicPage=["/login","/setup","/install","/offline"].includes(pathname);
  const refresh=useCallback(async()=>{
    const request=++sequence.current;
    if(publicPage){setUser(null);setReady(true);return;}
    try { const response=await fetchFresh("/api/auth/me"); if(!response.ok)throw new Error("ACCESS_LOAD_FAILED"); const data=await response.json(); if(request===sequence.current){setUser(data);setReady(true);} }
    catch(error){if(request===sequence.current){setUser(null);setReady(true);}throw error;}
  },[publicPage]);
  useEffect(()=>{void refresh().catch(()=>{});},[refresh,pathname]);
  useLiveRefresh(refresh);
  return <Context.Provider value={{user,ready,refresh}}>{children}</Context.Provider>;
}
export function useAppAccess(){const value=useContext(Context);return {...value,can:(feature:FeatureKey)=>canUseFeature(value.user,feature),canPath:(href:string)=>canVisit(value.user,href)};}
