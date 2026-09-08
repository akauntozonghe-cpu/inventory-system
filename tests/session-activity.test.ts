import { afterEach, expect, it, vi } from "vitest";
import { resetSessionActivity, ACTIVITY_KEY } from "../src/lib/session-activity";
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it("resets activity from the previous login before entering the protected screen",()=>{vi.useFakeTimers();vi.setSystemTime(2_000_000);const values=new Map([[ACTIVITY_KEY,"1"]]);vi.stubGlobal("localStorage",{setItem:(key:string,value:string)=>values.set(key,value)});resetSessionActivity();expect(values.get(ACTIVITY_KEY)).toBe("2000000");});
it("does not prevent login when browser storage is unavailable",()=>{vi.stubGlobal("localStorage",{setItem:()=>{throw new Error("blocked");}});expect(()=>resetSessionActivity()).not.toThrow();});
