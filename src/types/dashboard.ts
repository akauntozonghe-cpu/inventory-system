export type DashboardData = {
  summary: {
    totalItems: number;
    totalInventories: number;
    totalLocations: number;
  };

  stocktake: {
    total: number;
    completed: number;
    percent: number;
  };

  alerts: {
    difference: number;
    expired: number;
    shortage: number;
  };

  recentHistories: {
    id: string;
    action: string;
    changeQuantity: number;
    createdAt: string;
    inventoryInstance: {
      item: {
        name: string;
      };
    };
  }[];
};