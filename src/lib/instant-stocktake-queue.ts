"use client";

const DATABASE_NAME = "inventory-os-instant-save";
const DATABASE_VERSION = 1;
const STORE_NAME = "stocktake-records";

export type InstantStocktakeRecord = {
  id: string;
  sessionId: string;
  inventoryInstanceId: string;
  countedQuantity: number;
  memo?: string;
  createdAt: string;
  retryCount: number;
  lastErrorCode?: string;
  errorReportId?: string;
};

type SaveInstantStocktakeRecordInput = Omit<
  InstantStocktakeRecord,
  "id" | "createdAt" | "retryCount"
>;

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("端末内データの操作に失敗しました。"));
    };
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: "id",
        });

        store.createIndex("sessionId", "sessionId", {
          unique: false,
        });

        store.createIndex("createdAt", "createdAt", {
          unique: false,
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("端末内保存領域を開けませんでした。"));
    };
  });
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `instant-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

export function canUseInstantSave() {
  return (
    typeof window !== "undefined" &&
    typeof window.indexedDB !== "undefined"
  );
}

/**
 * 棚卸内容を、この端末内だけに一時保存する。
 * DBにはまだ反映されない。
 */
export async function saveInstantStocktakeRecord(
  input: SaveInstantStocktakeRecordInput
) {
  if (!canUseInstantSave()) {
    throw new Error("この端末ではインスタント保存を利用できません。");
  }

  const database = await openDatabase();

  try {
    const record: InstantStocktakeRecord = {
      ...input,
      id: createId(),
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    await requestToPromise(store.put(record));

    return record;
  } finally {
    database.close();
  }
}

/**
 * 指定した棚卸セッションの未送信データを取得する。
 */
export async function getInstantStocktakeRecords(sessionId?: string) {
  if (!canUseInstantSave()) {
    return [];
  }

  const database = await openDatabase();

  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    const records = (await requestToPromise(
      store.getAll()
    )) as InstantStocktakeRecord[];

    const filtered = sessionId
      ? records.filter((record) => record.sessionId === sessionId)
      : records;

    return filtered.sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
  } finally {
    database.close();
  }
}

/**
 * サーバーへの正式送信が成功した一時保存データを削除する。
 */
export async function removeInstantStocktakeRecord(id: string) {
  if (!canUseInstantSave()) {
    return;
  }

  const database = await openDatabase();

  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    await requestToPromise(store.delete(id));
  } finally {
    database.close();
  }
}

/**
 * 再送に失敗した記録を残す。
 */
export async function markInstantStocktakeRetry(
  record: InstantStocktakeRecord,
  errorCode: string
) {
  if (!canUseInstantSave()) {
    return;
  }

  const database = await openDatabase();

  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const updatedRecord: InstantStocktakeRecord = {
      ...record,
      retryCount: record.retryCount + 1,
      lastErrorCode: errorCode,
    };

    await requestToPromise(store.put(updatedRecord));
  } finally {
    database.close();
  }
}
