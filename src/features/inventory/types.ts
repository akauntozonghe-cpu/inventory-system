export type Item = {
  id: string;
  name: string;

  managementCode: string | null;
  managementGroupCode: string | null;

  manufacturer: string | null;
  majorCategory: string | null;
  minorCategory: string | null;

  defaultUnit: string | null;
};

export type StorageLocation = {
  id: string;
  name: string;
  description: string | null;
};

export type Inventory = {
  id: string;

  quantity: number;
  actualQuantity: number | null;

  allocationType: string;
  status: string;

  lotNo: string | null;
  expirationDate: string | null;
  unit: string | null;

  stocktakeStatus: string;
  stocktakeAt: string | null;

  storageLocation: StorageLocation | null;

  item: Item;
};