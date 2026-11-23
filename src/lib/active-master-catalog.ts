/**
 * Single authoritative selector for ordinary classification, location and QR label views.
 * The input is the same /api/admin/classifications payload. No master is inferred
 * from an item's historical string, an archived snapshot or print session state.
 */
export type ActiveClassification = {
  id:string;kind:string;name:string;parentName:string;
  retiredAt?:string|Date|null;retiredViaParent?:boolean;
};
export type ActiveLocation = {id:string;name:string;retiredAt?:string|Date|null};
export function selectActiveMasters<C extends ActiveClassification,L extends ActiveLocation>(
  classifications:readonly C[],locations:readonly L[]
):{majors:C[];minors:C[];locations:L[]} {
  const majors=classifications.filter(row=>row.kind==="MAJOR"&&!row.retiredAt&&!row.retiredViaParent);
  const majorNames=new Set(majors.map(row=>row.name));
  const minors=classifications.filter(row=>row.kind==="MINOR"&&!row.retiredAt&&!row.retiredViaParent&&majorNames.has(row.parentName));
  const natural=new Intl.Collator("ja",{numeric:true,sensitivity:"base"});
  const compare=(a:string,b:string)=>natural.compare(a,b)||(a<b?-1:a>b?1:0);
  return {
    majors:[...majors].sort((a,b)=>compare(a.name,b.name)||compare(a.id,b.id)),
    minors:[...minors].sort((a,b)=>compare(a.parentName,b.parentName)||compare(a.name,b.name)||compare(a.id,b.id)),
    locations:locations.filter(row=>!row.retiredAt).sort((a,b)=>compare(a.name,b.name)||compare(a.id,b.id)),
  };
}
