/** Japanese natural numeric order shared by the list, preview, and paper output. */
const natural = new Intl.Collator("ja", {numeric:true,sensitivity:"base"});
export const comparePrintText=(a:string,b:string)=>
  natural.compare(a.normalize("NFKC"),b.normalize("NFKC"))||
  (a<b?-1:a>b?1:0);

export type OrderedPrintLabel={id?:string;name:string;kind?:string;barcode?:string|null};
const kindOrder:Record<string,number>={"大分類":0,"小分類":1,"保管場所":2};
export function sortPrintLabels<T extends OrderedPrintLabel>(rows:readonly T[], grouping:"QR"|"BARCODE"):T[]{
  return [...rows].sort((a,b)=>{
    const ka=grouping==="QR"?(kindOrder[a.kind??""]??99):0;
    const kb=grouping==="QR"?(kindOrder[b.kind??""]??99):0;
    return ka-kb||comparePrintText(a.name,b.name)||
      comparePrintText(a.barcode??"",b.barcode??"")||
      comparePrintText(a.id??"",b.id??"");
  });
}
