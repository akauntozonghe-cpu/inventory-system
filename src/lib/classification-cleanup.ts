import type { Prisma } from "@prisma/client";

export type CleanupAssessment = {
  id: string | null;
  retiredAt?: Date | null;
  name: string;
  kind: "MAJOR" | "MINOR" | "LOCATION";
  canDelete: boolean;
  /** Zero-current-stock linked products can be unassigned before master retirement. */
  canUnassignAndDelete?: boolean;
  linkedItems?: Array<{id:string;name:string;updatedAt:Date}>;
  counts: {
    items: number;
    stocks: number;
    registrationRequests: number;
    activeStocktakes: number;
    childCategories: number;
    positiveStockRows?: number;
    archivedItems?: number;
  };
  reasons: string[];
  warning: string;
};

const activeStatuses = ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"] as const;

/** Count every linked item/stock, including archived entries.
 * A "zero products" badge in the UI is not proof that a master can be deleted:
 * lots may override categories and pending requests may still reference it.
 */
export async function assessClassificationCleanup(
  tx: Prisma.TransactionClient,
  kind: "MAJOR" | "MINOR",
  name: string,
  parentName = "",
): Promise<CleanupAssessment> {
  const master = await tx.classification.findUnique({
    where: { kind_name_parentName: { kind, name, parentName: kind === "MAJOR" ? "" : parentName } },
    select: { id: true, retiredAt: true },
  });

  const whereItem = kind === "MAJOR"
    ? { majorCategory: name }
    : { minorCategory: name, majorCategory: parentName };
  const whereStock: Prisma.InventoryInstanceWhereInput = kind === "MAJOR"
    ? { majorCategory: name }
    : { minorCategory: name, OR: [
      { majorCategory: parentName },
      { majorCategory: null, item: { majorCategory: parentName } },
    ] };
  const whereRequest = kind === "MAJOR"
    ? { majorCategory: name }
    : { majorCategory: parentName, minorCategory: name };

  const [items, stocks, registrationRequests, activeStocktakes, childCategories] = await Promise.all([
    tx.item.count({ where: whereItem }),
    tx.inventoryInstance.count({ where: whereStock }),
    tx.itemRegistrationRequest.count({ where: whereRequest }),
    tx.stocktakeSession.count({ where: {
      scopeType: kind === "MAJOR" ? "MAJOR_CATEGORY" : "MINOR_CATEGORY",
      scopeValue: name,
      status: { in: [...activeStatuses] },
    } }),
    kind === "MAJOR"
      ? tx.classification.count({ where: { kind: "MINOR", parentName: name } })
      : Promise.resolve(0),
  ]);

  const [positiveStockRows, archivedItems, linkedItems] = await Promise.all([
    // A current stock row of any affected product OR a lot-level override is
    // enough to block automatic unassignment when its quantity is positive.
    tx.inventoryInstance.count({where:{
      status:{not:"廃止"},quantity:{gt:0},
      OR:[
        {item:{is:{...(kind === "MAJOR" ? {majorCategory:name} : {majorCategory:parentName,minorCategory:name}),isArchived:false}}},
        whereStock,
      ],
    }}),
    tx.item.count({where:{...whereItem,isArchived:true}}),
    tx.item.findMany({where:{...whereItem,isArchived:false},select:{id:true,name:true,updatedAt:true},orderBy:{name:"asc"},take:100}),
  ]);
  const counts = { items, stocks, registrationRequests, activeStocktakes, childCategories, positiveStockRows, archivedItems };
  const canUnassignAndDelete=items>0 && items<=100 && linkedItems.length===items
    && archivedItems===0 && positiveStockRows===0
    && registrationRequests===0 && activeStocktakes===0 && childCategories===0;
  const reasons = [
    ...(items ? [`商品が${items}件使用しています`] : []),
    ...(stocks ? [`在庫明細が${stocks}件参照しています`] : []),
    ...(registrationRequests ? [`登録申請が${registrationRequests}件参照しています`] : []),
    ...(activeStocktakes ? [`進行中・確認中の棚卸が${activeStocktakes}件あります`] : []),
    ...(childCategories ? [`小分類が${childCategories}件あります`] : []),
  ];
  if (!master) reasons.unshift(items ? "商品に設定された分類名から生成された項目です（分類マスタは未登録）" : "分類マスタが既にありません。最新の一覧を確認してください");

  return {
    id: master?.id ?? null,
    retiredAt:master?.retiredAt ?? null,
    name, kind, counts, reasons,
    canDelete: Boolean(master) && reasons.length === 0,
    canUnassignAndDelete,
    linkedItems,
    warning: "商品マスタの分類と現在の在庫明細を変更する場合も、商品自体・数量・棚卸実績・取引履歴は削除しません。分類を削除すると発行済みの分類QRは使用できなくなります。",
  };
}

export async function assessLocationCleanup(
  tx: Prisma.TransactionClient,
  sourceId: string,
): Promise<CleanupAssessment> {
  const location = await tx.storageLocation.findUnique({
    where: { id: sourceId }, select: { id: true, name: true, retiredAt: true },
  });
  const name = location?.name ?? "";
  if (!location) return {
    id: null, name, kind: "LOCATION", canDelete: false,
    counts: { items: 0, stocks: 0, registrationRequests: 0, activeStocktakes: 0, childCategories: 0 },
    reasons: ["保管場所が存在しません。最新情報を再取得してください"],
    warning: "削除すると発行済みの保管場所QRは利用できなくなります。",
  };
  const [stocks, registrationRequests, activeStocktakes] = await Promise.all([
    tx.inventoryInstance.count({ where: { storageLocationId: sourceId } }),
    tx.itemRegistrationRequest.count({ where: { storageLocationId: sourceId } }),
    tx.stocktakeSession.count({ where: {
      scopeType: "LOCATION", scopeValue: name, status: { in: [...activeStatuses] },
    } }),
  ]);
  const counts = { items: 0, stocks, registrationRequests, activeStocktakes, childCategories: 0 };
  const reasons = [
    ...(stocks ? [`在庫明細が${stocks}件あります`] : []),
    ...(registrationRequests ? [`登録申請が${registrationRequests}件参照しています`] : []),
    ...(activeStocktakes ? [`進行中・確認中の棚卸が${activeStocktakes}件あります`] : []),
  ];
  return {
    id: location.id, retiredAt:location.retiredAt, name, kind: "LOCATION",
    counts, reasons, canDelete: reasons.length === 0,
    warning: "削除すると発行済みの保管場所QRは利用できなくなります。使用中の場合は在庫明細を移動してから整理してください。",
  };
}
