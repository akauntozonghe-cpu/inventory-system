import {it,expect} from "vitest";
import {productScanIndex,normalizeScanCode,addProductSelection} from "../src/lib/product-selection";
const items=[{id:"p1",name:"商品A",janCode:"4901234567894",systemBarcode:"SYS-A",inventoryInstances:[{id:"lot1"},{id:"lot2"}]},{id:"p2",name:"商品B",janCode:"4901234567894",systemBarcode:"SYS-B"}];
it("adds successive scans and does not toggle an already selected item off",()=>{const selection=addProductSelection(addProductSelection([],['p1']),['p2','p1']);expect(selection).toEqual(['p1','p2']);});
it("indexes item QR, lot QR and JAN without duplicating the same item",()=>{const index=productScanIndex(items);expect(index.get(normalizeScanCode('lot2'))?.map(r=>r.id)).toEqual(['p1']);expect(index.get('4901234567894')?.map(r=>r.id)).toEqual(['p1','p2']);expect(index.get(normalizeScanCode('SYS-A'))?.map(r=>r.id)).toEqual(['p1']);});
it("normalizes full-width scanner codes",()=>{expect(productScanIndex(items).get(normalizeScanCode('４９０１２３４５６７８９４'))).toHaveLength(2);});
it("enforces the server batch limit without losing existing selection",()=>{const previous=Array.from({length:500},(_,i)=>String(i));expect(()=>addProductSelection(previous,['new'])).toThrow('SELECTION_LIMIT');expect(previous).toHaveLength(500);expect(addProductSelection(previous,['0'])).toEqual(previous);});
