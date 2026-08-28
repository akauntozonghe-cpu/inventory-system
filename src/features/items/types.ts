export type Item = {
  id: string;
  name: string;
  janCode: string | null;
  systemBarcode: string | null;
  managementCode: string | null;
  managementGroupCode: string | null;
  manufacturer: string | null;
  majorCategory: string | null;
  minorCategory: string | null;
  defaultUnit: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  archiveReason: string | null;
  createdAt: string;
  inventoryInstances: Array<{
    id: string;
    quantity: number;
    actualQuantity: number | null;
    lotNo: string | null;
    expirationDate: string | null;
    unit: string | null;
    stocktakeStatus: string;
    storageLocation: { id: string; name: string } | null;
  }>;
};
