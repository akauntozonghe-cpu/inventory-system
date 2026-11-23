/** Sort Japanese labels using natural numeric order.
 * Examples: フリマ1, フリマ2, フリマ10, フリマ11.
 * This only controls presentation, never changes stored identities.
 */
const collator = new Intl.Collator("ja", {numeric:true, sensitivity:"base"});
export function compareLabels(left:string,right:string):number {
  return collator.compare(left,right) || (left < right ? -1 : left > right ? 1 : 0);
}
