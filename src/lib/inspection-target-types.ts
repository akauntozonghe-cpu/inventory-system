export const targetChecks = ["CHECK_INVALID_UNITS", "CHECK_PRODUCT_LINKS", "CHECK_PRODUCT_IDENTIFIERS", "CHECK_DUPLICATE_PRODUCTS", "CHECK_REVIEW_RECORDS", "CHECK_STOCKTAKE_TARGET_LINK", "CHECK_STOCKTAKE_LEGACY_STATE"] as const;
export type InspectionTarget = {
    id: string;
    itemId?: string;
    inventoryId?: string;
    sessionId?: string;
    name: string;
    owner?: string;
    lot?: string | null;
    location?: string | null;
    status?: string;
    updatedAt: string;
    sessionUpdatedAt?: string;
    editProduct?: boolean;
    itemUpdatedAt?: string;
    current: string;
    expected: string;
    instruction: string;
    href: string;
    action?: "SYNC_PRODUCT_METADATA" | "SET_UNIT" | "ISSUE_SYSTEM_BARCODE" | "RESTORE_TARGET";
    differences?: Array<{
        field: string;
        before: string | null;
        after: string | null;
    }>;
};
