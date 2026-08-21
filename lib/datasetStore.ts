export type Dataset = {
  fileName: string;
  columns: string[];
  rows: Record<string, string>[];
};

const DB_NAME = "aether-intelligence-db";
const STORE_NAME = "datasets";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(
        request.error || new Error("Could not open dataset storage.")
      );
    };

    request.onblocked = () => {
      reject(
        new Error("Dataset storage is blocked by another connection.")
      );
    };
  });
}

export async function saveDataset(dataset: Dataset): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(
        [STORE_NAME],
        "readwrite"
      );

      const store = transaction.objectStore(STORE_NAME);

      const request = store.put(dataset, "current");

      request.onerror = () => {
        reject(
          request.error ||
            new Error("Could not save the uploaded dataset.")
        );
      };

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };

      transaction.onerror = () => {
        db.close();

        reject(
          transaction.error ||
            new Error("Could not save the uploaded dataset.")
        );
      };

      transaction.onabort = () => {
        db.close();

        reject(
          transaction.error ||
            new Error("Dataset storage transaction was aborted.")
        );
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

export async function getDataset(): Promise<Dataset | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(
        [STORE_NAME],
        "readonly"
      );

      const store = transaction.objectStore(STORE_NAME);
      const request = store.get("current");

      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };

      request.onerror = () => {
        db.close();

        reject(
          request.error ||
            new Error("Could not read the saved dataset.")
        );
      };

      transaction.onerror = () => {
        db.close();

        reject(
          transaction.error ||
            new Error("Could not read the saved dataset.")
        );
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}