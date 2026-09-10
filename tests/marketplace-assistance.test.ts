import { expect, it } from "vitest";
import { median, minimumUnitPrice, officialRates, parcelFit, proposalNumbers } from "../src/lib/marketplace-assistance";
it("compares rotated packages and excludes minimum/maximum size violations",()=>{
 const rate=officialRates("mercari")[0];
 expect(parcelFit({length:2,width:24,height:15,weight:500},rate)).toBe("MATCH");
 expect(parcelFit({length:24,width:15,height:4,weight:500},rate)).toBe("NO");
 expect(parcelFit({length:20,width:10,height:2,weight:500},rate)).toBe("NO");
 expect(parcelFit({length:24,width:15,height:null,weight:500},rate)).toBe("UNKNOWN");
 expect(parcelFit({length:24,width:15,height:2,weight:1001},rate)).toBe("NO");
});
it("does not invent market prices or treat unknown costs as zero",()=>{
 const base={history:[],acquisitionCost:null,quantity:1,shipping:210,packaging:null,feeBps:1000,targetBps:2000};
 expect(proposalNumbers(base)).toMatchObject({price:null,profit:null,source:"UNKNOWN"});
 expect(proposalNumbers({...base,history:[1000,1200]})).toMatchObject({price:1100,profit:null,source:"HISTORY"});
});
it("accounts for quantity once for sales and acquisition, once per shipment for packaging",()=>{
 expect(proposalNumbers({history:[1000],acquisitionCost:200,quantity:2,shipping:210,packaging:50,feeBps:1000,targetBps:2000})).toMatchObject({price:1000,profit:1140});
 expect(minimumUnitPrice(660,2,1000,2000)).toBe(472);
 expect(minimumUnitPrice(660,2,1000,9000)).toBeNull();
 expect(median([100,200,9000,300])).toBe(250);
});
it("retains source-specific rates and required box costs",()=>{
 expect(officialRates("mercari")[1]).toMatchObject({fee:450,boxCost:70});
 expect(officialRates("yahoo_furima")[1]).toMatchObject({fee:490,boxCost:70});
 expect(officialRates("rakuma")[1]).toMatchObject({fee:430,boxCost:70});
 expect(officialRates("unknown")).toEqual([]);
});
