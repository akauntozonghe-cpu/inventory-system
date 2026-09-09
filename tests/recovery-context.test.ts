import {expect,it} from "vitest";
import {recoveryCheckCodes,recoveryActionAllowed,recoverySessionId} from "../src/lib/recovery-context";
it("does not recommend cancelling stocktakes for a notification or communication failure",()=>{for(const [route,code] of [["/notifications","PUSH_FAILED"],["/stocktake/s","NETWORK_ERROR"],["/marketplace","HTTP_503"]]){const codes=recoveryCheckCodes(route,code);expect(codes).toEqual(["CHECK_DATABASE_CONNECTION"]);expect(recoveryActionAllowed("CANCEL_SESSION",codes)).toBe(false);expect(recoveryActionAllowed("SYNC_PRODUCT_METADATA",codes)).toBe(false);}});
it("limits a stocktake recovery to its own identifier",()=>{expect(recoverySessionId("/stocktake/session-a/result","session-b")).toBe("session-a");expect(recoverySessionId("/stocktake/start")).toBe(null);});
it("selects barcode checks for barcode failures",()=>{expect(recoveryCheckCodes("/items","BARCODE_MISSING")).toEqual(["CHECK_DATABASE_CONNECTION","CHECK_PRODUCT_IDENTIFIERS"]);});
it("only the dedicated system check is comprehensive",()=>{expect(recoveryCheckCodes()).toBe(null);expect(recoveryCheckCodes("/admin/unknown")).toEqual(["CHECK_DATABASE_CONNECTION"]);});
