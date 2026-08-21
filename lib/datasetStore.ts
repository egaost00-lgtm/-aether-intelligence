export type Dataset = {
  fileName: string;
  columns: string[];
  rows: Record<string, string>[];
};

const DB_NAME = "aether-intelligence";
const STORE_NAME = "datasets";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    try {
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
          request.error ||
            new Error("Could not open the local dataset database.")
        );
      };

      request.onblocked = () => {
        reject(
          new Error("The dataset database is blocked by another connection.")
        );
      };
    } catch (error) {
      reject(
        error instanceof Error
          ? error
          : new Error("Could not open the dataset database.")
      );
    }
  });
}

export async function saveDataset(dataset: Dataset) {
  const db = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };

      transaction.onerror = () => {
        const error =
          transaction.error ||
          new Error("Could not save the dataset.");

        db.close();
        reject(error);
      };

      transaction.onabort = () => {
        const error =
          transaction.error ||
          new Error("Dataset save was aborted.");

        db.close();
        reject(error);
      };

      store.put(dataset, "current");
    } catch (error) {
      db.close();

      reject(
        error instanceof Error
          ? error
          : new Error("Could not save the dataset.")
      );
    }
  });
}

export async function getDataset(): Promise<Dataset | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get("current");

      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };

      request.onerror = () => {
        const error =
          request.error ||
          new Error("Could not read the saved dataset.");

        db.close();
        reject(error);
      };

      transaction.onabort = () => {
        db.close();
        reject(
          transaction.error ||
            new Error("Could not read the saved dataset.")
        );
      };
    } catch (error) {
      db.close();

      reject(
        error instanceof Error
          ? error
          : new Error("Could not read the saved dataset.")
      );
    }
  });
}