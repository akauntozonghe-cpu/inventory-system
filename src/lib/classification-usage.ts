/** Normal classification usage counts active products only. Archived products and stock
 * references are tracked separately as historical counts, never as active blockers.
 */
export type ClassificationUsageItem = {
  id?: string;
  name?: string;
  majorCategory: string | null;
  minorCategory: string | null;
  isArchived: boolean;
  _count: { inventoryInstances: number };
  inventoryInstances?: Array<{majorCategory:string|null;minorCategory:string|null;status:string}>;
};

export type ClassificationUsageMaster = {
  id: string;
  kind: string;
  name: string;
  parentName: string;
  labelCode?: string | null;
  retiredAt?: Date | null;
  retirementReason?: string | null;
};

export type ClassificationUsageRow = {
  id: string;
  kind: string;
  name: string;
  parentName: string;
  labelCode?: string | null;
  itemCount: number;
  inventoryCount: number;
  archivedItemCount: number;
  activeStockReferenceCount: number;
  archivedStockReferenceCount: number;
  retiredAt?: Date | null;
  retirementReason?: string | null;
  retiredViaParent?: boolean;
  linkedItems: Array<{id:string;name:string;isArchived:boolean}>;
};

function key(kind: string, parentName: string, name: string) {
  // A tuple key avoids parsing errors with ":" inside user-defined category names.
  return JSON.stringify([kind, kind === "MAJOR" ? "" : parentName, name]);
}

export function buildClassificationUsageRows(
  masters: ClassificationUsageMaster[],
  items: ClassificationUsageItem[],
): ClassificationUsageRow[] {
  const rows = new Map<string, ClassificationUsageRow>();
  for (const master of masters) {
    const parentName = master.kind === "MAJOR" ? "" : master.parentName;
    const lookup = key(master.kind, parentName, master.name);
    // Keep existing masters as distinct records when data is inconsistent,
    // but never reset usage counts collected from the Item master table.
    if (!rows.has(lookup)) rows.set(lookup, {
      ...master, parentName, itemCount: 0, inventoryCount: 0, archivedItemCount: 0, activeStockReferenceCount:0,archivedStockReferenceCount:0,linkedItems: [],
    });
  }

  for (const item of items) {
    const categories: Array<[string, string, string]> = [];
    if (item.majorCategory) categories.push(["MAJOR", "", item.majorCategory]);
    if (item.minorCategory) categories.push(["MINOR", item.majorCategory ?? "", item.minorCategory]);

    for (const [kind, parentName, name] of categories) {
      const lookup = key(kind, parentName, name);
      // An item string is NOT a classification master. Never invent a category
      // in the normal master list based on legacy or archived data.
      const row=rows.get(lookup);
      if(!row)continue;
      if (item.isArchived) {
        row.archivedItemCount += 1;
      } else {
        row.itemCount += 1;
        row.inventoryCount += item.inventoryInstances
          ? item.inventoryInstances.filter(stock=>stock.status!=="廃止").length
          : item._count.inventoryInstances;
        // Only currently active products are shown in the normal linked-item list.
        if (item.id && item.name && row.linkedItems.length < 100) {
          row.linkedItems.push({id:item.id,name:item.name,isArchived:false});
        }
      }
      rows.set(lookup, row);
    }
    for(const stock of item.inventoryInstances??[]){
      // Exact stock-level references use the same rules as deletion preflight.
      // Null category fields inherit the product master, but are not independent
      // references and must not prevent a master-only deletion after merge.
      const overrides: Array<[string,string,string]>=[];
      if(stock.majorCategory)overrides.push(["MAJOR","",stock.majorCategory]);
      if(stock.minorCategory)overrides.push(["MINOR",stock.majorCategory??item.majorCategory??"",stock.minorCategory]);
      for(const [kind,parentName,name] of overrides){
        const lookup=key(kind,parentName,name);
        // Orphaned stock-level strings are reported by the administrator
        // audit, not silently reintroduced as selectable master records.
        const row=rows.get(lookup);
        if(!row)continue;
        if(item.isArchived||stock.status==="廃止")row.archivedStockReferenceCount+=1;
        else row.activeStockReferenceCount+=1;
        rows.set(lookup,row);
      }
    }
  }
  return [...rows.values()];
}
