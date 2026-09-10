import {productCodes} from "@/lib/product-scope";
export default function ProductIdentity({item,inventoryId}:{item:{id:string;janCode?:string|null;systemBarcode?:string|null};inventoryId?:string}){
  const codes=productCodes(item);
  return <dl className="my-2 grid gap-1 text-xs text-slate-600"><div><dt className="inline font-bold">{codes.label}：</dt><dd className="inline break-all font-mono">{codes.code??"未設定"}</dd></div><div><dt className="inline font-bold">管理No.：</dt><dd className="inline break-all font-mono" title="商品を一意に識別するシステム管理番号。変更されません。">{codes.managementNo}</dd></div>{inventoryId&&<div><dt className="inline font-bold">在庫No.：</dt><dd className="inline break-all font-mono" title="場所・Lotごとの在庫明細を識別します。">{inventoryId}</dd></div>}</dl>;
}
