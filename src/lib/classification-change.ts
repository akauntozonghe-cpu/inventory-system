export function nextClassification(current:{majorCategory:string|null;minorCategory:string|null},change:{majorCategory?:string|null;minorCategory?:string|null;keepMinorCategory?:boolean}){
 const hasMajor=Object.prototype.hasOwnProperty.call(change,"majorCategory"),hasMinor=Object.prototype.hasOwnProperty.call(change,"minorCategory");
 const majorCategory=hasMajor?change.majorCategory??null:current.majorCategory;
 const minorCategory=hasMinor?change.minorCategory??null:hasMajor&&majorCategory!==current.majorCategory&&!change.keepMinorCategory?null:current.minorCategory;
 return {majorCategory,minorCategory:majorCategory?minorCategory:null};
}
